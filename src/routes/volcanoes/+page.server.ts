import type { PageServerLoad } from './$types';
import { getVolcanoes } from '$lib/server/services/aggregate';
import type { DisasterEvent } from '$lib/types';

/**
 * Volcano activity page load.
 *
 * Activity level I–IV is the OFFICIAL PVMBG status, so it is presented as the
 * authority's classification and is NOT flagged `severityIsInternal`.
 */
export const load: PageServerLoad = async () => {
	try {
		const payload = await getVolcanoes();
		return {
			volcanoes: payload.events as DisasterEvent[],
			counts: payload.counts ?? {},
			updatedAt: payload.retrievedAt,
			cached: payload.cached,
			stale: payload.stale,
			degraded: payload.degraded,
			error: null as string | null
		};
	} catch {
		return {
			volcanoes: [] as DisasterEvent[],
			counts: {} as Record<string, number>,
			updatedAt: new Date().toISOString(),
			cached: false,
			stale: false,
			degraded: true,
			error:
				'Data aktivitas gunung api tidak dapat dimuat saat ini. Sumber PVMBG/MAGMA mungkin sedang tidak dapat dijangkau.'
		};
	}
};
