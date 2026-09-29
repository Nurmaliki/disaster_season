import type { PageServerLoad } from './$types';
import { getSourceStatusView } from '$lib/server/services/dashboard';
import { getAllProviderHealth, PROVIDER_DESCRIPTORS } from '$lib/server/services/health';

/**
 * Status page load: the last observed health of each provider, plus the declared
 * catalogue. A provider that has never been called is reported as
 * `unconfigured`, never as healthy.
 */
export const load: PageServerLoad = async () => {
	return {
		status: {
			observed: getAllProviderHealth(),
			providers: getSourceStatusView(),
			declaredCount: PROVIDER_DESCRIPTORS.length,
			liveProbe: null as Record<string, unknown> | null
		},
		error: null as string | null
	};
};
