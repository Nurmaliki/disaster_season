import type { PageServerLoad } from './$types';
import { getHotspots } from '$lib/server/services/aggregate';
import { firmsConfigured } from '$lib/server/providers/firms/wildfire';
import type { DisasterEvent } from '$lib/types';

/**
 * Wildfire / karhutla page load.
 *
 * The only reachable source is NASA FIRMS, and each point is a satellite
 * *hotspot* (thermal anomaly) — never a confirmed fire. FIRMS is opt-in: when
 * `FIRMS_MAP_KEY` is unset the provider is dormant and yields zero detections,
 * which we surface explicitly (`configured: false`) instead of faking data.
 */
export const load: PageServerLoad = async () => {
	const configured = firmsConfigured();

	try {
		const payload = await getHotspots();
		const hotspots = (payload.events as DisasterEvent[]).filter(
			(event) => event.type === 'wildfire'
		);

		return {
			hotspots,
			configured,
			updatedAt: payload.retrievedAt,
			cached: payload.cached,
			stale: payload.stale,
			degraded: payload.degraded,
			error: null as string | null
		};
	} catch {
		return {
			hotspots: [] as DisasterEvent[],
			configured,
			updatedAt: new Date().toISOString(),
			cached: false,
			stale: false,
			degraded: true,
			error:
				'Data titik panas tidak dapat dimuat saat ini. Sumber NASA FIRMS mungkin sedang tidak dapat dijangkau.'
		};
	}
};
