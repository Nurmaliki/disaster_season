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

/**
 * GET /api/nearby?lat=-6.2&lng=106.8&radiusKm=100
 *
 * Events within a radius of a coordinate.
 *
 * PRIVACY: the coordinate is used only to compute the response in-process. It is
 * never stored, logged with precision, or forwarded to any upstream provider
 * (all provider calls are unfiltered national feeds). The request is not
 * persisted anywhere.
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

		// Only events with real coordinates participate; placeholder (0,0)
		// locations are excluded so they are never reported as "nearby".
		const withCoords = aggregate.events.filter((event) => {
			const { latitude, longitude } = event.location;
			return (
				Number.isFinite(latitude) &&
				Number.isFinite(longitude) &&
				!(latitude === 0 && longitude === 0)
			);
		});

		const nearby = withinRadius(
			withCoords.map((event) => ({
				event,
				latitude: event.location.latitude,
				longitude: event.location.longitude
			})),
			{ latitude: lat, longitude: lng },
			radiusKm
		);

		const events = nearby
			.slice(0, limit ?? 100)
			.map((entry) => ({
				...entry.event,
				metadata: { ...entry.event.metadata, distanceKm: Math.round(entry.distanceKm * 10) / 10 }
			}))
			.sort((a, b) => eventTimestamp(b) - eventTimestamp(a));

		const province = findProvince(String(Math.round(lat)).padStart(2, '0'));

		return apiSuccess(
			{
				center: { latitude: lat, longitude: lng },
				radiusKm,
				events,
				/** Province is approximate (from latitude band) and offered as a hint only. */
				approxProvince: province?.name ?? null
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
