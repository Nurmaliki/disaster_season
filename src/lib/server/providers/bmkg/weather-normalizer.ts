import type { Severity } from '$lib/types';
import type { BmkgWeatherPoint, BmkgWeatherResponse }  from '$lib/server/providers/bmkg/weather';

const SOURCE_NAME = 'BMKG';
const SOURCE_URL = 'https://www.bmkg.go.id/cuaca/prakiraan-cuaca.bmkg';

/** A single forecast slot, cleaned up for the UI. */
export interface NormalizedWeatherSlot {
	/** ISO timestamp in UTC. */
	datetime: string;
	/** Local (WIB/WITA/WIT) timestamp as reported by BMKG. */
	localDatetime: string;
	timezone: string;
	temperatureC: number | null;
	humidity: number | null;
	condition: string;
	conditionEn: string;
	cloudCoverPct: number | null;
	precipitationMm: number | null;
	windSpeedKmh: number | null;
	windDirection: string | null;
	windDirectionDeg: number | null;
	iconUrl: string | null;
}

export interface NormalizedWeather {
	location: {
		adm1: string;
		adm2: string;
		adm3: string;
		adm4: string;
		province: string;
		regency: string;
		district: string;
		village: string;
		latitude: number;
		longitude: number;
		timezone: string;
	};
	slots: NormalizedWeatherSlot[];
	/** The slot closest to now, used by the summary card. */
	current: NormalizedWeatherSlot | null;
	daily: Array<{
		date: string;
		label: string;
		minTempC: number | null;
		maxTempC: number | null;
		dominantCondition: string;
		maxPrecipitationMm: number | null;
		iconUrl: string | null;
	}>;
	severity: Severity;
	severityReason: string;
	source: { name: string; url: string };
	updatedAt: string;
}

/** Rain intensity thresholds (mm/3h slot) used for our internal classification. */
function rainSeverity(maxPrecipitation: number): { severity: Severity; reason: string } {
	if (maxPrecipitation >= 50)
		return { severity: 'critical', reason: 'Prakiraan curah hujan sangat lebat (≥50 mm)' };
	if (maxPrecipitation >= 20)
		return { severity: 'high', reason: 'Prakiraan curah hujan lebat (20–50 mm)' };
	if (maxPrecipitation >= 5)
		return { severity: 'moderate', reason: 'Prakiraan curah hujan sedang (5–20 mm)' };
	if (maxPrecipitation >= 0.5)
		return { severity: 'low', reason: 'Prakiraan curah hujan ringan (<5 mm)' };
	return { severity: 'low', reason: 'Tidak ada prakiraan hujan signifikan' };
}

function toNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSlot(point: BmkgWeatherPoint, timezone: string): NormalizedWeatherSlot | null {
	const datetime = point.datetime ?? point.utc_datetime;
	if (!datetime) return null;
	const parsed = new Date(point.datetime ?? `${point.utc_datetime}Z`);
	if (Number.isNaN(parsed.getTime())) return null;

	return {
		datetime: parsed.toISOString(),
		localDatetime: point.local_datetime ?? '',
		timezone,
		temperatureC: toNumber(point.t),
		humidity: toNumber(point.hu),
		condition: point.weather_desc ?? 'Tidak diketahui',
		conditionEn: point.weather_desc_en ?? '',
		cloudCoverPct: toNumber(point.tcc),
		precipitationMm: toNumber(point.tp),
		windSpeedKmh: toNumber(point.ws),
		windDirection: point.wd ?? null,
		windDirectionDeg: toNumber(point.wd_deg),
		iconUrl: point.image ?? null
	};
}

const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Normalizes a BMKG forecast payload into slots + daily rollups.
 *
 * BMKG nests the forecast as `data[].cuaca[][]` — an array of groups, each of
 * which is an array of slots. We flatten it and de-duplicate by timestamp,
 * because consecutive groups can overlap.
 */
export function normalizeWeather(payload: BmkgWeatherResponse, retrievedAt: string): NormalizedWeather {
	const timezone = payload.lokasi?.timezone ?? 'Asia/Jakarta';

	const flat: BmkgWeatherPoint[] = [];
	for (const group of payload.data ?? []) {
		for (const slots of group.cuaca ?? []) {
			if (Array.isArray(slots)) flat.push(...slots);
		}
	}

	const byTimestamp = new Map<string, NormalizedWeatherSlot>();
	for (const point of flat) {
		const slot = normalizeSlot(point, timezone);
		if (!slot) continue;
		if (!byTimestamp.has(slot.datetime)) byTimestamp.set(slot.datetime, slot);
	}

	const slots = [...byTimestamp.values()].sort(
		(a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
	);

	const now = Date.now();
	let current: NormalizedWeatherSlot | null = null;
	for (const slot of slots) {
		if (new Date(slot.datetime).getTime() >= now - 3 * 3600_000) {
			current = slot;
			break;
		}
	}
	current ??= slots[0] ?? null;

	// Group by local calendar day for the daily rollup.
	const dayBuckets = new Map<
		string,
		{ temps: number[]; precipitation: number[]; conditions: Map<string, number>; icon: string | null }
	>();
	for (const slot of slots) {
		const localDate = (slot.localDatetime || slot.datetime).slice(0, 10);
		let bucket = dayBuckets.get(localDate);
		if (!bucket) {
			bucket = { temps: [], precipitation: [], conditions: new Map(), icon: null };
			dayBuckets.set(localDate, bucket);
		}
		if (slot.temperatureC !== null) bucket.temps.push(slot.temperatureC);
		if (slot.precipitationMm !== null) bucket.precipitation.push(slot.precipitationMm);
		if (slot.condition) bucket.conditions.set(slot.condition, (bucket.conditions.get(slot.condition) ?? 0) + 1);
		if (!bucket.icon && slot.iconUrl) bucket.icon = slot.iconUrl;
	}

	const daily = [...dayBuckets.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([date, bucket]) => {
			let dominant = 'Tidak diketahui';
			let best = -1;
			for (const [condition, count] of bucket.conditions) {
				if (count > best) {
					best = count;
					dominant = condition;
				}
			}
			const parsedDate = new Date(`${date}T00:00:00+07:00`);
			const label = Number.isNaN(parsedDate.getTime())
				? date
				: DAY_LABELS[parsedDate.getUTCDay()] ?? date;
			return {
				date,
				label,
				minTempC: bucket.temps.length ? Math.min(...bucket.temps) : null,
				maxTempC: bucket.temps.length ? Math.max(...bucket.temps) : null,
				dominantCondition: dominant,
				maxPrecipitationMm: bucket.precipitation.length ? Math.max(...bucket.precipitation) : null,
				iconUrl: bucket.icon
			};
		});

	const maxRain = daily.reduce((acc, d) => Math.max(acc, d.maxPrecipitationMm ?? 0), 0);
	const { severity, reason } = rainSeverity(maxRain);

	return {
		location: {
			adm1: payload.lokasi.adm1,
			adm2: payload.lokasi.adm2,
			adm3: payload.lokasi.adm3,
			adm4: payload.lokasi.adm4,
			province: payload.lokasi.provinsi,
			regency: payload.lokasi.kotkab,
			district: payload.lokasi.kecamatan,
			village: payload.lokasi.desa,
			latitude: payload.lokasi.lat,
			longitude: payload.lokasi.lon,
			timezone
		},
		slots,
		current,
		daily,
		severity,
		severityReason: reason,
		source: { name: SOURCE_NAME, url: SOURCE_URL },
		updatedAt: retrievedAt
	};
}
