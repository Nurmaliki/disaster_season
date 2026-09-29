import type { RequestHandler } from './$types';
import { timingSafeEqual } from 'node:crypto';
import { config } from '$lib/server/config';
import { runRetention } from '$lib/server/services/maintenance';
import { apiSuccess, apiFailure, handleApiError } from '$lib/server/api/response';
import { logger } from '$lib/server/logger';

/**
 * GET /api/maintenance/retention
 *
 * Prunes persisted events older than the retention window. Intended to be
 * called by a scheduler (e.g. a Vercel cron), not by the app itself.
 *
 * SECURITY:
 *  - Requires `Authorization: Bearer <CRON_SECRET>` (Vercel cron sends this
 *    automatically when `CRON_SECRET` is set on the project).
 *  - When `CRON_SECRET` is not configured the route refuses to run at all
 *    (503). An unauthenticated destructive endpoint is worse than no pruning.
 *  - The comparison is constant-time to avoid leaking the secret by timing.
 */

function constantTimeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

function isAuthorised(header: string | null, secret: string): boolean {
	if (!header) return false;
	const match = /^Bearer (.+)$/.exec(header.trim());
	if (!match) return false;
	return constantTimeEqual(match[1], secret);
}

export const GET: RequestHandler = async ({ request }) => {
	try {
		if (!config.maintenance.enabled) {
			// Refusing is the safe default: no secret means no authentication.
			return apiFailure(
				'UNAVAILABLE',
				'Endpoint pemeliharaan tidak aktif. Setel CRON_SECRET untuk mengaktifkannya.',
				503
			);
		}

		if (!isAuthorised(request.headers.get('authorization'), config.maintenance.cronSecret)) {
			logger.warn('maintenance request rejected: bad credentials', { scope: 'maintenance' });
			return apiFailure('FORBIDDEN', 'Tidak diizinkan.', 401);
		}

		const report = await runRetention();

		return apiSuccess(report, {
			source: 'internal',
			updatedAt: report.ranAt,
			cached: false
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/maintenance/retention');
	}
};
