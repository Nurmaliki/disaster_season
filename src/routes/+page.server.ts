import type { PageServerLoad } from './$types';
import { getDashboard } from '$lib/server/services/dashboard';
import type { DashboardPayload } from '$lib/api/types';

/**
 * Homepage load.
 *
 * Runs server-side so the dashboard is present in the initial HTML (good for
 * slow connections, accessibility and SEO). A provider failure is caught here
 * and surfaced as `error` in the page data rather than crashing the render.
 */
export const load: PageServerLoad = async ({ setHeaders }) => {
	// The page itself is cheap to re-render; the data is cached in the services.
	setHeaders({
		'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=120'
	});

	try {
		const dashboard = await getDashboard();
		return {
			dashboard: dashboard as DashboardPayload,
			loadError: null as string | null,
			loadedAt: new Date().toISOString()
		};
	} catch (error) {
		return {
			dashboard: null as DashboardPayload | null,
			loadError:
				'Data tidak dapat dimuat saat ini. Sumber resmi mungkin sedang tidak dapat dijangkau.',
			loadedAt: new Date().toISOString(),
			detail: error instanceof Error ? error.message : String(error)
		};
	}
};
