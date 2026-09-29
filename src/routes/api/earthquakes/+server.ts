import type { RequestHandler } from './$types';
import { getEarthquakes, queryEvents } from '$lib/server/services/aggregate';
import { eventStore } from '$lib/server/services/merge';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';
import { paramsToObject } from '$lib/server/api/validation';
import { z } from 'zod';

/**
 * GET /api/earthquakes
 *
 * BMKG earthquake records.
 *
 * IMPORTANT: this is a record of earthquakes that HAVE HAPPENED ("gempa
 * terbaru", "riwayat gempa"). This application does not and cannot predict
 * earthquakes, and no endpoint or UI string may imply otherwise.
 */

const querySchema = z.object({
	minMagnitude: z.coerce.number().min(0).max(10).default(0),
	tsunamiOnly: z.enum(['0', '1']).default('0'),
	includeHistory: z.enum(['0', '1']).default('1'),
	limit: z.coerce.number().int().min(1).max(500).default(50)
});

export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'earthquakes'), { windowMs: 60_000, max: 120 });
	if (!limited.allowed) {
		return apiFailure(
			'RATE_LIMIT',
			'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.',
			429
		);
	}

	try {
		const parsed = querySchema.safeParse(paramsToObject(url));
		if (!parsed.success) {
			return apiFailure(
				'VALIDATION_ERROR',
				parsed.error.issues[0]?.message ?? 'Parameter tidak valid',
				400
			);
		}

		const { minMagnitude, tsunamiOnly, includeHistory, limit } = parsed.data;
		const payload = await getEarthquakes();
		eventStore.put(payload.events);

		let quakes = queryEvents(payload.events, {
			types: ['earthquake'],
			categories: includeHistory === '1' ? undefined : ['current_event']
		});

		if (minMagnitude > 0) {
			quakes = quakes.filter((event) => {
				const magnitude = Number(event.metadata?.magnitude);
				return Number.isFinite(magnitude) && magnitude >= minMagnitude;
			});
		}

		if (tsunamiOnly === '1') {
			quakes = quakes.filter((event) => event.metadata?.tsunamiPotential === true);
		}

		quakes = quakes.slice(0, limit);

		return apiSuccess(quakes, {
			source: 'BMKG — Gempa Bumi',
			updatedAt: payload.retrievedAt,
			cached: payload.cached,
			stale: payload.stale,
			partial: payload.degraded,
			count: quakes.length,
			warnings: payload.error ? [payload.error] : undefined
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/earthquakes');
	}
};
