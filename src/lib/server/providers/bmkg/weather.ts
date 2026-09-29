import { fetchJson, HttpError, type FetchOptions }  from '$lib/server/http';
import { logger }  from '$lib/server/logger';
import { config }  from '$lib/server/config';

/**
 * BMKG public weather forecast API.
 *
 * Verified live: GET https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=31.71.01.1001
 * The API also accepts adm1 / adm2 / adm3 codes. adm4 (village) is the most
 * precise level and is what the location dashboard uses.
 *
 * Note: api.bmkg.go.id issues a 301 to api-apps.bmkg.go.id; fetch follows it.
 */
export interface BmkgWeatherPoint {
	datetime: string;
	t: number | null;
	tcc: number | null;
	tp: number | null;
	weather: number | null;
	weather_desc: string | null;
	weather_desc_en: string | null;
	wd_deg: number | null;
	wd: string | null;
	wd_to: string | null;
	ws: number | null;
	hu: number | null;
	vs: number | null;
	vs_text: string | null;
	time_index: string | null;
	analysis_date?: string | null;
	image?: string | null;
	utc_datetime?: string | null;
	local_datetime: string | null;
}

export interface BmkgWeatherLocation {
	adm1: string;
	adm2: string;
	adm3: string;
	adm4: string;
	provinsi: string;
	kotkab: string;
	kecamatan: string;
	desa: string;
	lon: number;
	lat: number;
	timezone: string;
}

export interface BmkgWeatherResponse {
	lokasi: BmkgWeatherLocation;
	data: Array<{
		lokasi?: BmkgWeatherLocation;
		cuaca: BmkgWeatherPoint[][];
	}>;
}

export type AdmLevel = 1 | 2 | 3 | 4;

export function isValidAdmCode(level: AdmLevel, code: string): boolean {
	const pattern = /^\d{2}(\.\d{2}){0,3}$/;
	if (!pattern.test(code)) return false;
	const segments = code.split('.').length;
	return segments === level;
}

export async function fetchWeather(
	level: AdmLevel,
	code: string,
	options: FetchOptions = {}
): Promise<{ data: BmkgWeatherResponse; status: number; durationMs: number; url: string }> {
	if (!isValidAdmCode(level, code)) {
		throw new HttpError(`Invalid adm${level} code: ${code}`, 400, 'NOT_FOUND');
	}

	const url = `${config.providers.bmkg.apiBaseUrl}/publik/prakiraan-cuaca?adm${level}=${encodeURIComponent(code)}`;

	try {
		const result = await fetchJson<BmkgWeatherResponse | { data: [] }>(url, {
			timeoutMs: config.providers.bmkg.timeoutMs,
			retries: 2,
			...options
		});

		const payload = result.data as BmkgWeatherResponse;
		if (!payload?.lokasi) {
			// BMKG returns `{"data": []}` for unknown codes with HTTP 200.
			throw new HttpError(`No forecast data for ${code}`, 404, 'NOT_FOUND');
		}

		return { data: payload, status: result.status, durationMs: result.durationMs, url };
	} catch (error) {
		logger.warn('bmkg weather fetch failed', { provider: 'bmkg', endpoint: url, error });
		throw error;
	}
}
