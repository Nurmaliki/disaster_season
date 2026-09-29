import type { PageServerLoad } from './$types';
import { getWarnings, queryEvents } from '$lib/server/services/aggregate';
import type { DisasterEvent } from '$lib/types';

/**
 * Early warnings page load. Only `early_warning` category events are returned;
 * expired alerts are filtered out by the normalizer.
 */
export const load: PageServerLoad = async () => {
	try {
		const payload = await getWarnings();
		const warnings = queryEvents(payload.events, { categories: ['early_warning'] });

		return {
			warnings: warnings as DisasterEvent[],
			updatedAt: payload.retrievedAt,
			cached: payload.cached,
			stale: payload.stale,
			degraded: payload.degraded,
			error: null as string | null
		};
	} catch {
		return {
			warnings: [] as DisasterEvent[],
			updatedAt: new Date().toISOString(),
			cached: false,
			stale: false,
			degraded: true,
			error:
				'Peringatan dini tidak dapat dimuat saat ini. Sumber BMKG mungkin sedang tidak dapat dijangkau.'
		};
	}
};
