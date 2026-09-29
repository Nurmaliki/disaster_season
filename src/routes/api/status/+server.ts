import type { RequestHandler } from './$types';
import {
	apiSuccess,
	handleApiError,
	checkRateLimit,
	clientKey,
	apiFailure
} from '$lib/server/api/response';
import { getSourceStatusView } from '$lib/server/services/dashboard';
import { getAllProviderHealth, PROVIDER_DESCRIPTORS } from '$lib/server/services/health';
import { isDatabaseEnabled } from '$lib/server/db/client';
import { cache } from '$lib/server/cache';
import { config } from '$lib/server/config';

/**
 * GET /api/status
 *
 * Provider health.
 *
 * Two complementary views are returned:
 *   - `observed`: the last real outcome recorded in this process, which can
 *     never claim a provider is healthy without a successful call.
 *   - `declared`: every provider the app knows about, including those never yet
 *     contacted, which are reported as `unconfigured`.
 *
 * `?probe=1` additionally performs a live BMKG reachability check so the status
 * page can show current reality rather than a stale cache. Probing is opt-in
 * because it costs an upstream request.
 */
export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'status'), { windowMs: 60_000, max: 30 });
	if (!limited.allowed) {
		return apiFailure(
			'RATE_LIMIT',
			'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.',
			429
		);
	}

	try {
		const probe = url.searchParams.get('probe') === '1';

		const observed = getAllProviderHealth();
		const view = getSourceStatusView();

		let liveProbe: Record<string, unknown> | null = null;
		if (probe) {
			liveProbe = await runLiveProbe();
		}

		return apiSuccess(
			{
				observed,
				providers: view,
				declaredCount: PROVIDER_DESCRIPTORS.length,
				liveProbe,
				persistence: {
					/** True when events are written to durable storage. */
					enabled: isDatabaseEnabled(),
					/** Stateless means history is lost on restart — stated plainly. */
					mode: isDatabaseEnabled() ? 'durable' : 'stateless',
					retentionDays: isDatabaseEnabled() ? config.database.retentionDays : null
				},
				/**
				 * The in-process response cache. Exposed so operators can see it is
				 * per-instance and best-effort — NOT durable storage. A larger number
				 * here is never a substitute for `DATABASE_URL`.
				 */
				cache: {
					scope: 'per-instance' as const,
					entries: cache.size
				}
			},
			{
				source: 'Registry kesehatan provider',
				updatedAt: new Date().toISOString(),
				cached: !probe,
				count: view.length
			}
		);
	} catch (error) {
		return handleApiError(error, 'GET /api/status');
	}
};

/**
 * A minimal, safe reachability probe against BMKG.
 * It never asserts a provider is "up" speculatively — the result is the real
 * HTTP outcome, and a failure is reported as a failure.
 */
async function runLiveProbe(): Promise<Record<string, unknown>> {
	const started = Date.now();
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 8000);
		const response = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json', {
			method: 'GET',
			signal: controller.signal,
			headers: { accept: 'application/json' }
		});
		clearTimeout(timer);

		return {
			target: 'BMKG data.bmkg.go.id',
			reachable: response.ok,
			status: response.status,
			durationMs: Date.now() - started,
			checkedAt: new Date().toISOString()
		};
	} catch (error) {
		return {
			target: 'BMKG data.bmkg.go.id',
			reachable: false,
			status: null,
			durationMs: Date.now() - started,
			checkedAt: new Date().toISOString(),
			error: error instanceof Error ? error.message : 'unknown'
		};
	}
}
