import type { PageServerLoad } from './$types';
import { getSourceStatusView } from '$lib/server/services/dashboard';
import { getAllProviderHealth, PROVIDER_DESCRIPTORS } from '$lib/server/services/health';
import { isDatabaseEnabled } from '$lib/server/db/client';
import { cache } from '$lib/server/cache';
import { config } from '$lib/server/config';

/**
 * Status page load: the last observed health of each provider, plus the declared
 * catalogue. A provider that has never been called is reported as
 * `unconfigured`, never as healthy.
 *
 * It also states which storage mode is active, so a deployer can tell at a
 * glance whether history is durable or merely in-process.
 */
export const load: PageServerLoad = async () => {
	const databaseEnabled = isDatabaseEnabled();

	return {
		status: {
			observed: getAllProviderHealth(),
			providers: getSourceStatusView(),
			declaredCount: PROVIDER_DESCRIPTORS.length,
			liveProbe: null as Record<string, unknown> | null,
			persistence: {
				enabled: databaseEnabled,
				mode: (databaseEnabled ? 'durable' : 'stateless') as 'stateless' | 'durable',
				retentionDays: databaseEnabled ? config.database.retentionDays : null
			},
			cache: {
				scope: 'per-instance' as const,
				entries: cache.size
			}
		},
		error: null as string | null
	};
};
