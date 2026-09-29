import type { RequestHandler } from './$types';
import { aggregateEvents } from '$lib/server/services/aggregate';
import { withinRadius } from '$lib/utils/geo';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';
import { radiusSchema, paramsToObject } from '$lib/server/api/validation';
import { findProvince } from '$lib/utils/regions';
import { eventTimestamp } from '$lib/server/services/merge';
import { findEventsNearby } from '$lib/server/db/repository';

/**
 * GET /api/nearby?lat=-6.2&lng=106.8&radiusKm=100
 *
 * Events within a radius of a coordinate.
 *
 * Two sources are combined:
 *   - live events from the current aggregate (always available), and
 *   - durable history from Postgres via `earthdistance`, when configured.
 *
 * The database path is preferred when available because it also surfaces events
 * from before this instance started, and performs the distance search in SQL.
 * Live events are merged on top (they win on id collisions) so the freshest
 * copy of any event is always the one returned.
 *
 * PRIVACY: the coordinate is used only to compute the response in-process. It is
 * never stored, logged with precision, or forwarded to any upstream provider
 * (all provider calls are unfiltered national feeds). The request is not
 * persisted anywhere — a nearby search is never written to the database.
 */

export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'nearby'), { windowMs: 60_000, max: 60 });
	if (!limited.allowed) {
		return apiFailure(
			'RATE_LIMIT',
			'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.',
			429
		);
	}

	try {
		const parsed = radiusSchema.safeParse(paramsToObject(url));
		if (!parsed.success) {
			return apiFailure(
				'VALIDATION_ERROR',
				'Koordinat tidak valid atau berada di luar wilayah Indonesia.',
				400
			);
		}

		const { lat, lng, radiusKm, limit } = parsed.data;

		const aggregate = await aggregateEvents();

		// Attempt the database-backed spatial search first. `null` means it is
		// unavailable (no DB, or the earthdistance extension is missing), in
		// which case we fall back to in-memory filtering over the live events.
		const persisted = await findEventsNearby(lat, lng, radiusKm, { limit: limit ?? 100 });

		// Live events with real coordinates, distance-filtered in memory.
		const liveWithCoords = aggregate.events.filter((event) => {
			const { latitude, longitude } = event.location;
			return (
				Number.isFinite(latitude) &&
				Number.isFinite(longitude) &&
				!(latitude === 0 && longitude === 0)
			);
		});

		const liveNearby = withinRadius(
			liveWithCoords.map((event) => ({
				event,
				latitude: event.location.latitude,
				longitude: event.location.longitude
			})),
			{ latitude: lat, longitude: lng },
			radiusKm
		);

		// Merge: persist the event objects, live copies winning.
		const byId = new Map<
			string,
			{ event: (typeof aggregate.events)[number]; distanceKm: number }
		>();
		for (const entry of persisted ?? []) {
			byId.set(entry.event.id, { event: entry.event, distanceKm: entry.distanceKm });
		}
		for (const entry of liveNearby) {
			byId.set(entry.event.id, {
				event: entry.event,
				distanceKm: Math.round(entry.distanceKm * 10) / 10
			});
		}

		const events = [...byId.values()]
			.map(({ event, distanceKm }) => ({
				...event,
				metadata: { ...event.metadata, distanceKm }
			}))
			.sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
			.slice(0, limit ?? 100);

		const province = findProvince(String(Math.round(lat)).padStart(2, '0'));

		return apiSuccess(
			{
				center: { latitude: lat, longitude: lng },
				radiusKm,
				events,
				/** Province is approximate (from latitude band) and offered as a hint only. */
				approxProvince: province?.name ?? null,
				/** Whether durable history contributed to this result. */
				searchedHistory: persisted !== null
			},
			{
				source: 'BMKG, PVMBG/MAGMA',
				updatedAt: aggregate.updatedAt,
				cached: true,
				partial: aggregate.partial,
				count: events.length
			}
		);
	} catch (error) {
		return handleApiError(error, 'GET /api/nearby');
	}
};
