import type { PageServerLoad } from './$types';
import { getDashboard } from '$lib/server/services/dashboard';
import type { DashboardPayload } from '$lib/api/types';

/**
 * The map page needs the same event set as the dashboard, so it reuses the
 * cached dashboard service. It requests a larger limit because the map shows
 * every event at once.
 */
export const load: PageServerLoad = async () => {
	try {
		const dashboard = await getDashboard({ limit: 200 });
		return {
			dashboard: dashboard as DashboardPayload,
			loadError: null as string | null
		};
	} catch {
		return {
			dashboard: null as DashboardPayload | null,
			loadError:
				'Peta tidak dapat memuat data peristiwa saat ini. Sumber resmi mungkin sedang tidak dapat dijangkau.'
		};
	}
};
