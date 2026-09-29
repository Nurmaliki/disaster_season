import type { RequestHandler } from './$types';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';
import { searchEverything } from '$lib/server/services/search';
import { paramsToObject } from '$lib/server/api/validation';
import { z } from 'zod';

/**
 * GET /api/search?q=bandung
 *
 * Unified search over regions (bundled BPS/BIG table) and current events
 * (live aggregate). Every result carries a `kind` and a concrete `href` so the
 * client links to a real page rather than a search results page.
 *
 * The response reports `eventsSearched` so the UI can distinguish "no matching
 * events" from "events could not be searched right now" — a provider outage
 * must never be presented as a genuine zero.
 */

const querySchema = z.object({
	q: z.string().trim().min(2).max(80),
	limit: z.coerce.number().int().min(1).max(20).default(6)
});

export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'search'), { windowMs: 60_000, max: 180 });
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

		const { q, limit } = parsed.data;
		const results = await searchEverything(q, limit);

		return apiSuccess(results, {
			source: 'BPS/BIG Kode Wilayah; BMKG; PVMBG/MAGMA',
			updatedAt: new Date().toISOString(),
			cached: false,
			count: results.regions.length + results.events.length
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/search');
	}
};
