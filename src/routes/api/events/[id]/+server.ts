import type { RequestHandler } from './$types';
import { aggregateEvents } from '$lib/server/services/aggregate';
import { eventStore } from '$lib/server/services/merge';
import { readEventById } from '$lib/server/db/repository';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';

/**
 * GET /api/events/[id]
 *
 * A single event by id.
 *
 * Resolution order is deliberate: the live store first (it always holds the
 * freshest copy), then durable history, so a bookmarked link keeps working
 * after the event has aged out of the upstream feed. A miss is a real 404 —
 * never a placeholder record — and the response says which path answered via
 * `fromHistory`.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	const limited = checkRateLimit(clientKey(request, 'event-detail'), {
		windowMs: 60_000,
		max: 180
	});
	if (!limited.allowed) {
		return apiFailure(
			'RATE_LIMIT',
			'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.',
			429
		);
	}

	try {
		const id = decodeURIComponent(params.id);

		// Warm the in-process store from the aggregate. A provider failure here
		// must not prevent us from finding a persisted event below.
		try {
			const aggregate = await aggregateEvents();
			eventStore.put(aggregate.events);
		} catch {
			// Ignore: fall through to the store / history lookup.
		}

		const live = eventStore.get(id);
		if (live) {
			return apiSuccess(live, {
				source: live.source.name,
				updatedAt: live.updatedAt,
				cached: true,
				fromHistory: false
			});
		}

		const persisted = await readEventById(id);
		if (persisted) {
			return apiSuccess(persisted, {
				source: persisted.source.name,
				updatedAt: persisted.updatedAt,
				cached: true,
				fromHistory: true
			});
		}

		return apiFailure(
			'NOT_FOUND',
			'Peristiwa tidak ditemukan. Kemungkinan sudah tidak tersedia pada sumber resmi atau ID tidak valid.',
			404
		);
	} catch (error) {
		return handleApiError(error, 'GET /api/events/[id]');
	}
};
