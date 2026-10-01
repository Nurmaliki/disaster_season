import { PROVINCES } from '$lib/data/provinces';
import { getWeather } from '$lib/server/services/aggregate';
import { logger } from '$lib/server/logger';

/**
 * Wind field for the map's particle animation.
 *
 * BMKG exposes wind only per administrative region (adm4), never as a grid, so
 * there is no national raster to sample. To still drive a flowing-particle
 * overlay we probe a coarse lattice of representative points (one per province
 * capital, which we already know the adm4 code for) and turn each reading into a
 * vector.
 *
 * Design notes:
 *  - Each probe goes through `getWeather`, which is cached (~15 min, 2 h stale),
 *    so a burst of map loads does not hammer BMKG: the lattice is tiny and
 *    mostly answers from cache.
 *  - Probes run with a concurrency cap and per-point failure tolerance — one
 *    dead adm4 must not blank the whole field. A missing vector simply is not
 *    emitted; the client falls back to a calm/no-field state.
 *  - Directions follow the meteorological convention BMKG reports ("wind from"),
 *    converted here to the direction the air moves *towards* (a flow vector),
 *    which is what an animation must stroke.
 */

export interface WindSample {
	latitude: number;
	longitude: number;
	/** Eastward component of the flow, km/h (positive = blowing east). */
	u: number;
	/** Northward component of the flow, km/h (positive = blowing north). */
	v: number;
	/** Wind speed, km/h. */
	speedKmh: number;
	/** Compass the wind blows *from*, e.g. "Barat Laut". */
	fromDirection: string | null;
}

export interface WindField {
	samples: WindSample[];
	/** ISO time the field was assembled (server clock). */
	updatedAt: string;
	/** True when at least one probe failed and the field is thinner than usual. */
	partial: boolean;
}

const MAX_CONCURRENCY = 6;

/** Runs `worker` over `items` with a bounded number of in-flight tasks. */
async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	worker: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let cursor = 0;

	async function run(): Promise<void> {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await worker(items[index]);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
	return results;
}

/**
 * Builds the wind field by probing every province capital that has a known
 * adm4 code. Points without a reading are dropped.
 */
export async function getWindField(): Promise<WindField> {
	const points = PROVINCES.filter((p) => p.capitalAdm4);

	const settled = await mapWithConcurrency(points, MAX_CONCURRENCY, async (province) => {
		try {
			const { weather } = await getWeather(province.capitalAdm4!);
			const current = weather.current;
			if (!current) return null;

			const speed = current.windSpeedKmh;
			const deg = current.windDirectionDeg;
			if (speed === null || deg === null || !Number.isFinite(speed) || !Number.isFinite(deg)) {
				return null;
			}

			// BMKG's `wd_deg` is the direction the wind comes FROM, measured
			// clockwise from north. The flow travels the opposite way, so add
			// 180° and decompose into east/north components.
			const toRad = ((deg + 180) % 360) * (Math.PI / 180);
			const u = speed * Math.sin(toRad);
			const v = speed * Math.cos(toRad);

			return {
				latitude: weather.location.latitude || province.latitude,
				longitude: weather.location.longitude || province.longitude,
				u,
				v,
				speedKmh: speed,
				fromDirection: current.windDirection ?? null
			} satisfies WindSample;
		} catch (error) {
			logger.warn('wind probe failed', {
				provider: 'bmkg-weather',
				province: province.code,
				error: error instanceof Error ? error.message : error
			});
			return null;
		}
	});

	const samples = settled.filter((s): s is WindSample => s !== null);

	return {
		samples,
		updatedAt: new Date().toISOString(),
		partial: samples.length < points.length
	};
}
