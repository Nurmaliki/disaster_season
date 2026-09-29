import type { RequestHandler } from './$types';
import { getWeather } from '$lib/server/services/aggregate';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';
import { adm4Schema } from '$lib/server/api/validation';

/**
 * GET /api/weather?adm4=31.71.01.1001
 *
 * BMKG public weather forecast for a village-level (adm4) region.
 *
 * The BMKG endpoint accepts adm1/adm2/adm3 too but returns HTML for them, so we
 * require a full adm4 code and validate it before calling upstream — this keeps
 * malformed/adm4-less requests from consuming provider quota.
 */
export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'weather'), { windowMs: 60_000, max: 120 });
	if (!limited.allowed) {
		return apiFailure(
			'RATE_LIMIT',
			'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.',
			429
		);
	}

	try {
		const adm4Raw = url.searchParams.get('adm4') ?? '';
		const adm4 = adm4Schema.safeParse(adm4Raw);

		if (!adm4.success) {
			return apiFailure(
				'VALIDATION_ERROR',
				'Kode wilayah adm4 tidak valid. Contoh yang benar: 31.71.01.1001',
				400
			);
		}

		const forceRefresh = url.searchParams.get('refresh') === '1';
		const result = await getWeather(adm4.data, { forceRefresh });

		return apiSuccess(result.weather, {
			source: 'BMKG — Prakiraan Cuaca',
			updatedAt: result.weather.location ? new Date().toISOString() : new Date().toISOString(),
			cached: result.cached,
			stale: result.stale,
			partial: result.degraded
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/weather');
	}
};
