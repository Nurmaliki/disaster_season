import type { RequestHandler } from './$types';
import { getWindField } from '$lib/server/services/wind';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';

/**
 * GET /api/wind
 *
 * Coarse wind field for the map's particle overlay. Wind is sampled at province
 * capitals (the finest units BMKG returns a reliable forecast for), assembled
 * into a small vector set, and cached upstream so repeat views are cheap.
 *
 * This is a visualisation aid assembled from point forecasts, not a gridded
 * numerical wind model — the client must present it as approximate.
 */
export const GET: RequestHandler = async ({ request }) => {
	const limited = checkRateLimit(clientKey(request, 'wind'), { windowMs: 60_000, max: 60 });
	if (!limited.allowed) {
		return apiFailure(
			'RATE_LIMIT',
			'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.',
			429
		);
	}

	try {
		const field = await getWindField();

		if (!field.samples.length) {
			return apiFailure(
				'PROVIDER_ERROR',
				'Data angin sementara tidak tersedia. Coba beberapa saat lagi.',
				502
			);
		}

		return apiSuccess(field, {
			source: 'BMKG — Prakiraan Cuaca',
			updatedAt: field.updatedAt,
			partial: field.partial
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/wind');
	}
};
