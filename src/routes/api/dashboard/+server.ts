import type { RequestHandler } from './$types';
import { getDashboard } from '$lib/server/services/dashboard';
import { apiSuccess, handleApiError, checkRateLimit, clientKey } from '$lib/server/api/response';
import { apiFailure } from '$lib/server/api/response';

/**
 * GET /api/dashboard
 *
 * The homepage payload: active warnings, recent earthquakes, significant
 * volcanoes, ranked events, counts and the internal risk indicator.
 *
 * Provider failures degrade the payload (`meta.partial`) instead of failing it,
 * so the dashboard still renders when one source is down.
 */
export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'dashboard'), { windowMs: 60_000, max: 120 });
	if (!limited.allowed) {
		return apiFailure(
			'RATE_LIMIT',
			'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.',
			429
		);
	}

	try {
		const forceRefresh = url.searchParams.get('refresh') === '1';
		const limitRaw = Number(url.searchParams.get('limit'));
		const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 8;

		const dashboard = await getDashboard({ limit, forceRefresh });

		return apiSuccess(dashboard, {
			source: 'BMKG, PVMBG/MAGMA',
			updatedAt: dashboard.updatedAt,
			cached: true,
			partial: dashboard.partial,
			warnings: dashboard.warnings,
			count: dashboard.topEvents.length
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/dashboard');
	}
};
