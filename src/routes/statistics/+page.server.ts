import type { PageServerLoad } from './$types';
import { getStatistics } from '$lib/server/services/dashboard';
import { WINDOW_MS } from '$lib/server/api/validation';
import type { StatisticsPayload } from '$lib/api/types';

/**
 * Statistics page load. Defaults to a 7-day window; every count is derived from
 * real fetched events, never estimated.
 */
export const load: PageServerLoad = async () => {
	try {
		const stats = await getStatistics(WINDOW_MS['7d'], '7d');
		return {
			stats: stats as StatisticsPayload,
			error: null as string | null
		};
	} catch {
		return {
			stats: null as StatisticsPayload | null,
			error:
				'Statistik tidak dapat dimuat saat ini. Sumber data mungkin sedang tidak dapat dijangkau.'
		};
	}
};
