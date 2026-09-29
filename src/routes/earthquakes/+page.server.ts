import type { PageServerLoad } from './$types';
import { getEarthquakes, queryEvents } from '$lib/server/services/aggregate';
import type { DisasterEvent } from '$lib/types';

/**
 * Earthquakes page load.
 *
 * IMPORTANT VOCABULARY: this page lists earthquakes that HAVE ALREADY OCCURRED
 * ("gempa terbaru", "riwayat gempa"). Nothing here predicts earthquakes, and no
 * copy may imply that it does.
 */
export const load: PageServerLoad = async () => {
	try {
		const payload = await getEarthquakes();
		const quakes = queryEvents(payload.events, { types: ['earthquake'] });

		return {
			quakes: quakes as DisasterEvent[],
			updatedAt: payload.retrievedAt,
			cached: payload.cached,
			stale: payload.stale,
			degraded: payload.degraded,
			error: null as string | null
		};
	} catch {
		return {
			quakes: [] as DisasterEvent[],
			updatedAt: new Date().toISOString(),
			cached: false,
			stale: false,
			degraded: true,
			error:
				'Data gempa tidak dapat dimuat saat ini. Sumber BMKG mungkin sedang tidak dapat dijangkau.'
		};
	}
};
