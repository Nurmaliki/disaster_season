import type { RequestHandler } from './$types';
import { getStatistics } from '$lib/server/services/dashboard';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';
import { windowSchema, WINDOW_MS, paramsToObject } from '$lib/server/api/validation';
import { z } from 'zod';

/**
 * GET /api/statistics?window=7d
 *
 * Aggregated counts over a real time window. Every number is derived from
 * events actually fetched from official sources — nothing is estimated,
 * sampled or synthesised.
 */

const querySchema = z.object({
	window: windowSchema
});

export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'statistics'), { windowMs: 60_000, max: 60 });
	if (!limited.allowed) {
		return apiFailure(
			'RATE_LIMIT',
			'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.',
			429
		);
	}

	try {
		const parsed = querySchema.safeParse(paramsToObject(url));
		if (!parsed.success) {
			return apiFailure(
				'VALIDATION_ERROR',
				parsed.error.issues[0]?.message ?? 'Parameter tidak valid',
				400
			);
		}

		const { window } = parsed.data;
		const stats = await getStatistics(WINDOW_MS[window], window);

		return apiSuccess(stats, {
			source: 'BMKG, PVMBG/MAGMA',
			updatedAt: stats.updatedAt,
			cached: true,
			partial: stats.partial,
			count: stats.total
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/statistics');
	}
};
