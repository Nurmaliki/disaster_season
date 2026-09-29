import { fetchJson, HttpError, type FetchOptions } from '$lib/server/http';
import { config } from '$lib/server/config';
import { logger } from '$lib/server/logger';

/**
 * NASA FIRMS — Fire Information for Resource Management System.
 *
 * STATUS (verified live, 2026): `firms.modaps.eosdis.nasa.gov` is reachable from
 * general-purpose hosting and the area API responds. It is the ONLY reachable
 * source of wildfire information for Indonesia:
 *   - BMKG publishes no public hotspot endpoint (probed, 404).
 *   - SIPONGI (KLHK) does not even resolve in DNS from general hosting.
 *   - BNPB / InaRISK are unreachable (as documented elsewhere).
 *
 * FIRMS detects *thermal anomalies* ("hotspots") from satellite instruments
 * (VIIRS/MODIS). A hotspot is a detection, not a confirmed fire: it can be a
 * small burn, land clearing, or a false positive. The normalizer therefore
 * labels these events as `observation` (see `wildfire-normalizer.ts`) so they
 * are never presented as confirmed fires.
 *
 * A free MAP_KEY is required by the area API. Without it the provider reports
 * itself as unconfigured and returns zero detections — it never invents data.
 */

export const firmsMeta = {
	id: 'firms-wildfire',
	name: 'NASA FIRMS — Titik Panas (Hotspot)',
	attribution: 'NASA FIRMS (Fire Information for Resource Management System)',
	domains: ['wildfire'] as const,
	url: 'https://firms.modaps.eosdis.nasa.gov/',
	category: 'observation' as const,
	priority: 70
};

/**
 * Indonesia's bounding box, generously padded: west,south,east,north.
 * Exported so tests and the provider share one definition.
 */
export const INDONESIA_BBOX = '94,-12,142,8';

/** One parsed CSV row from the FIRMS area API. */
export interface FirmsHotspot {
	latitude: number;
	longitude: number;
	brightness: number | null;
	/** Acquisition date, "YYYY-MM-DD". */
	acqDate: string | null;
	/** Acquisition time, "HHMM" (UTC). */
	acqTime: string | null;
	satellite: string | null;
	instrument: string | null;
	confidence: string | null;
	frp: number | null;
	daynight: string | null;
}

export interface FirmsFetchResult {
	hotspots: FirmsHotspot[];
	status: number;
	durationMs: number;
	url: string;
	/** True when no MAP_KEY is configured, so nothing was requested. */
	unconfigured: boolean;
}

/**
 * Parses the FIRMS area-API CSV body.
 *
 * The header is not fixed: columns vary by source and product, so parsing is
 * header-driven rather than positional. Rows without usable coordinates are
 * dropped rather than guessed.
 */
export function parseFirmsCsv(csv: string): FirmsHotspot[] {
	const lines = csv
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	// A valid response with no detections still carries a header row.
	if (lines.length < 2) return [];

	const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
	const index = (name: string): number => header.indexOf(name);

	const iLat = index('latitude');
	const iLon = index('longitude');
	if (iLat < 0 || iLon < 0) return [];

	const iBright = index('bright_ti4') >= 0 ? index('bright_ti4') : index('brightness');
	const iDate = index('acq_date');
	const iTime = index('acq_time');
	const iSat = index('satellite');
	const iInstr = index('instrument');
	const iConf = index('confidence');
	const iFrp = index('frp');
	const iDaynight = index('daynight');

	const toNum = (value: string | undefined): number | null => {
		if (value === undefined) return null;
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	};

	const hotspots: FirmsHotspot[] = [];

	for (let i = 1; i < lines.length; i++) {
		const cols = lines[i].split(',');
		const lat = toNum(cols[iLat]);
		const lon = toNum(cols[iLon]);
		if (lat === null || lon === null) continue;
		if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

		hotspots.push({
			latitude: lat,
			longitude: lon,
			brightness: toNum(iBright >= 0 ? cols[iBright] : undefined),
			acqDate: iDate >= 0 ? (cols[iDate]?.trim() ?? null) : null,
			acqTime: iTime >= 0 ? (cols[iTime]?.trim() ?? null) : null,
			satellite: iSat >= 0 ? (cols[iSat]?.trim() ?? null) : null,
			instrument: iInstr >= 0 ? (cols[iInstr]?.trim() ?? null) : null,
			confidence: iConf >= 0 ? (cols[iConf]?.trim() ?? null) : null,
			frp: toNum(iFrp >= 0 ? cols[iFrp] : undefined),
			daynight: iDaynight >= 0 ? (cols[iDaynight]?.trim() ?? null) : null
		});
	}

	return hotspots;
}

/** True when the provider has the credential it needs to run. */
export function firmsConfigured(): boolean {
	return Boolean(config.providers.firms.mapKey);
}

/**
 * Fetches recent hotspot detections over Indonesia.
 *
 * Throws when the provider is configured but the upstream call fails, so the
 * caller can record a real failure. Returns zero hotspots (not an error) when no
 * MAP_KEY is set — the feature is opt-in, not broken.
 */
export async function fetchHotspots(options: FetchOptions = {}): Promise<FirmsFetchResult> {
	const { baseUrl, mapKey, source, dayRange, timeoutMs } = config.providers.firms;

	if (!mapKey) {
		return {
			hotspots: [],
			status: 0,
			durationMs: 0,
			url: `${baseUrl}/api/area/csv`,
			unconfigured: true
		};
	}

	const days = Math.min(Math.max(Math.trunc(dayRange) || 1, 1), 5);
	const url = `${baseUrl}/api/area/csv/${encodeURIComponent(mapKey)}/${encodeURIComponent(source)}/${INDONESIA_BBOX}/${days}`;

	try {
		// FIRMS returns text/csv, not JSON.
		const result = await fetchJson<string>(url, {
			timeoutMs: timeoutMs ?? 20_000,
			retries: 1,
			parse: 'text',
			accept: 'text/csv',
			...options
		});

		// A bad key still returns HTTP 200 with a plain-text body, so check it.
		if (result.data.startsWith('Invalid MAP_KEY')) {
			throw new HttpError('FIRMS rejected the MAP_KEY', 401, 'PROVIDER_ERROR');
		}

		const hotspots = parseFirmsCsv(result.data);
		return {
			hotspots,
			status: result.status,
			durationMs: result.durationMs,
			url,
			unconfigured: false
		};
	} catch (error) {
		logger.warn('firms hotspot fetch failed', { provider: 'firms-wildfire', endpoint: url, error });
		throw error;
	}
}
