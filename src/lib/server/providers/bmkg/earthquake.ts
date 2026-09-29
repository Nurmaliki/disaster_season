import { fetchJson, HttpError, type FetchOptions } from '$lib/server/http';
import { logger } from '$lib/server/logger';

const BASE = 'https://data.bmkg.go.id/DataMKG/TEWS';

/**
 * Raw BMKG TEWS (Tsunami Early Warning System) earthquake record.
 * Field names mirror BMKG's Indonesian JSON exactly so that parsing stays
 * auditable against the upstream payload.
 */
export interface BmkgRawQuake {
	Tanggal: string;
	Jam: string;
	DateTime: string;
	Coordinates: string;
	Lintang: string;
	Bujur: string;
	Magnitude: string;
	Kedalaman: string;
	Wilayah: string;
	Potensi: string;
	/** Present in gempadirasakan.json */
	Dirasakan?: string;
	/** Shakemap file name, present in some feeds, e.g. "20260928214309.mmi.jpg" */
	Shakemap?: string;
	/** BMKG internal identifier when provided. */
	guid?: string;
}

export interface BmkgQuakeResponse {
	Infogempa: {
		gempa: BmkgRawQuake | BmkgRawQuake[];
	};
}

export type EarthquakeFeed = 'autogempa' | 'gempaterkini' | 'gempadirasakan';

/**
 * Fetches one of BMKG's public earthquake feeds.
 *
 * Verified endpoints (checked live against data.bmkg.go.id):
 *   GET /DataMKG/TEWS/autogempa.json        -> latest event (single object)
 *   GET /DataMKG/TEWS/gempaterkini.json     -> last ~15 M5+ events (array)
 *   GET /DataMKG/TEWS/gempadirasakan.json   -> recent felt events (array)
 */
export async function fetchEarthquakeFeed(
	feed: EarthquakeFeed,
	options: FetchOptions = {}
): Promise<{ data: BmkgRawQuake[]; status: number; durationMs: number; url: string }> {
	const url = `${BASE}/${feed}.json`;
	try {
		const result = await fetchJson<BmkgQuakeResponse>(url, {
			timeoutMs: 12_000,
			retries: 2,
			...options
		});

		const gempa = result.data?.Infogempa?.gempa;
		if (!gempa) {
			throw new HttpError('Unexpected BMKG payload shape', 502, 'PROVIDER_ERROR');
		}

		const list = Array.isArray(gempa) ? gempa : [gempa];
		return { data: list, status: result.status, durationMs: result.durationMs, url };
	} catch (error) {
		logger.warn('bmkg earthquake feed failed', { provider: 'bmkg', endpoint: url, error });
		throw error;
	}
}

/** Builds BMKG's public shakemap image URL (static assets, no API key). */
export function shakemapUrl(shakemapFile: string | undefined): string | undefined {
	if (!shakemapFile) return undefined;
	return `https://data.bmkg.go.id/DataMKG/TEWS/${shakemapFile.trim()}`;
}
