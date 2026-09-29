import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { aggregateEvents } from '$lib/server/services/aggregate';
import { eventStore } from '$lib/server/services/merge';
import { eventRiskScore } from '$lib/server/risk/engine';
import type { DisasterEvent } from '$lib/types';

/**
 * Event detail load.
 *
 * The in-process store is empty on a cold instance, so we always populate it
 * from the aggregate before looking the event up. If the event truly cannot be
 * found (e.g. it aged out of the upstream feed), we return a 404 with an honest
 * message rather than a fabricated placeholder.
 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const id = decodeURIComponent(params.id);

	setHeaders({
		'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
	});

	try {
		const aggregate = await aggregateEvents();
		eventStore.put(aggregate.events);
	} catch {
		// Fall through: we may already have the event from a previous request.
	}

	const event = eventStore.get(id);

	if (!event) {
		throw error(404, {
			message:
				'Peristiwa tidak ditemukan. Kemungkinan sudah tidak tersedia pada sumber resmi atau ID tidak valid.'
		});
	}

	// Related events: same type, newest first, excluding the event itself.
	const related = eventStore
		.all()
		.filter((candidate) => candidate.id !== event.id && candidate.type === event.type)
		.slice(0, 6);

	return {
		event: event as DisasterEvent,
		related: related as DisasterEvent[],
		internalRisk: eventRiskScore(event),
		updatedAt: new Date().toISOString()
	};
};
