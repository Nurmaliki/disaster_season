import { PROVINCES } from '$lib/data/provinces';
import { getWeather } from '$lib/server/services/aggregate';
import { classifyHumidity, type HumidityLevel } from '$lib/utils/humidity';
import { logger } from '$lib/server/logger';

/**
 * National relative-humidity snapshot, for the homepage summary.
 *
 * BMKG publishes humidity only per administrative region (adm4), never as a
 * national grid. To give the homepage a single, honest national figure we probe
 * one representative point per province capital — the same approach the wind
 * field uses — and summarise what came back.
 *
 * Design notes:
 *  - Every probe goes through `getWeather`, which is cached (~15 min, 2 h stale),
 *    so a burst of homepage loads mostly answers from cache. The lattice is tiny.
 *  - Probes are bounded (concurrency cap) and per-point failures are tolerated:
 *    one dead adm4 must not blank the whole summary. Missing points are simply
 *    not counted, and `partial` reports that the snapshot is thinner than usual.
 *  - This is a **forecast** figure (BMKG prakiraan), not an observation, and the
 *    band classification is our own internal indicator. The UI labels both.
 */

export interface HumidityProvince {
	code: string;
	name: string;
	latitude: number;
	longitude: number;
	humidity: number;
	temperatureC: number | null;
	capitalName: string;
}

export interface HumiditySummary {
	/** One entry per province capital that returned a reading. */
	provinces: HumidityProvince[];
	/** Mean of the province readings (%), or null when nothing came back. */
	nationalAverage: number | null;
	/** Min/max across the province readings (%), or null when nothing came back. */
	min: number | null;
	max: number | null;
	/** How many provinces returned a reading. */
	sampledCount: number;
	/** How many province capitals were probed in total. */
	totalCount: number;
	/** Distribution of readings across our internal humidity bands. */
	bandCounts: Record<HumidityLevel, number>;
	updatedAt: string;
	/** True when at least one probe failed and the snapshot is thinner than usual. */
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

const EMPTY_BAND_COUNTS: Record<HumidityLevel, number> = {
	very_dry: 0,
	dry: 0,
	comfortable: 0,
	humid: 0,
	very_humid: 0
};

/**
 * Builds the national humidity summary by probing every province capital that
 * has a known adm4 code. Points without a humidity reading are dropped.
 */
export async function getHumiditySummary(): Promise<HumiditySummary> {
	const points = PROVINCES.filter((p) => p.capitalAdm4);

	const settled = await mapWithConcurrency(points, MAX_CONCURRENCY, async (province) => {
		try {
			const { weather } = await getWeather(province.capitalAdm4!);
			const current = weather.current;
			const humidity = current?.humidity ?? null;
			if (humidity === null || !Number.isFinite(humidity)) return null;

			return {
				code: province.code,
				name: province.name,
				latitude: weather.location.latitude || province.latitude,
				longitude: weather.location.longitude || province.longitude,
				humidity,
				temperatureC: current?.temperatureC ?? null,
				capitalName: weather.location.village || weather.location.regency || ''
			} satisfies HumidityProvince;
		} catch (error) {
			logger.warn('humidity probe failed', {
				provider: 'bmkg-weather',
				province: province.code,
				error: error instanceof Error ? error.message : error
			});
			return null;
		}
	});

	const provinces = settled.filter((p): p is HumidityProvince => p !== null);

	const bandCounts: Record<HumidityLevel, number> = { ...EMPTY_BAND_COUNTS };
	for (const province of provinces) {
		const band = classifyHumidity(province.humidity);
		if (band) bandCounts[band.level] += 1;
	}

	const values = provinces.map((p) => p.humidity);
	const nationalAverage = values.length
		? values.reduce((sum, value) => sum + value, 0) / values.length
		: null;

	return {
		provinces,
		nationalAverage,
		min: values.length ? Math.min(...values) : null,
		max: values.length ? Math.max(...values) : null,
		sampledCount: provinces.length,
		totalCount: points.length,
		bandCounts,
		updatedAt: new Date().toISOString(),
		partial: provinces.length < points.length
	};
}
