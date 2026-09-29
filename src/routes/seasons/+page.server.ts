import type { PageServerLoad } from './$types';
import { getSeasonContext } from '$lib/server/services/seasons';
import { aggregateEvents, queryEvents } from '$lib/server/services/aggregate';
import { eventTimestamp } from '$lib/server/services/merge';
import type { DisasterEvent } from '$lib/types';

/**
 * Seasons page load.
 *
 * Shows the current national seasonal phase and the hydro-meteorological events
 * that are climatologically consistent with it. We never claim a seasonal event
 * is caused by the season — only that it falls within the seasonal window.
 */
export const load: PageServerLoad = async () => {
	const season = getSeasonContext();

	let hydroEvents: DisasterEvent[] = [];
	let partial: boolean;
	try {
		const aggregate = await aggregateEvents();
		partial = aggregate.partial;
		hydroEvents = queryEvents(aggregate.events, {
			types: ['flood', 'flash_flood', 'landslide', 'drought', 'wildfire', 'extreme_weather'],
			limit: 12
		}).sort((a, b) => eventTimestamp(b) - eventTimestamp(a));
	} catch {
		partial = true;
	}

	return { season, hydroEvents, partial, updatedAt: new Date().toISOString() };
};
