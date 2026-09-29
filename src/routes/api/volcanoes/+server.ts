import type { RequestHandler } from './$types';
import { getVolcanoes } from '$lib/server/services/aggregate';
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
 * GET /api/volcanoes
 *
 * PVMBG / MAGMA volcano activity levels.
 *
 * Activity level (I–IV) is the OFFICIAL published status, so `severity` here
 * mirrors the authority's own classification and is not flagged as internal.
 * Volcanoes whose coordinates are not published are returned with
 * `metadata.coordinatesKnown: false` so clients never plot a fabricated point.
 */

const querySchema = z.object({
	level: z.enum(['all', 'I', 'II', 'III', 'IV']).default('all'),
	aboveNormalOnly: z.enum(['0', '1']).default('0'),
	limit: z.coerce.number().int().min(1).max(200).default(100)
});

export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'volcanoes'), { windowMs: 60_000, max: 60 });
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

		const { level, aboveNormalOnly, limit } = parsed.data;
		const payload = await getVolcanoes();

		let volcanoes = [...payload.events];

		if (level !== 'all') {
			volcanoes = volcanoes.filter((event) => event.metadata?.level === level);
		}

		if (aboveNormalOnly === '1') {
			volcanoes = volcanoes.filter((event) =>
				['II', 'III', 'IV'].includes(String(event.metadata?.level))
			);
		}

		// Highest activity level first, then alphabetical.
		const levelRank = (value: unknown): number =>
			(({ IV: 4, III: 3, II: 2, I: 1 }) as Record<string, number>)[String(value)] ?? 0;
		volcanoes.sort(
			(a, b) =>
				levelRank(b.metadata?.level) - levelRank(a.metadata?.level) ||
				a.title.localeCompare(b.title, 'id')
		);

		volcanoes = volcanoes.slice(0, limit);

		return apiSuccess(
			{ volcanoes, counts: payload.counts },
			{
				source: 'PVMBG / MAGMA — Gunung Api',
				updatedAt: payload.retrievedAt,
				cached: payload.cached,
				stale: payload.stale,
				partial: payload.degraded,
				count: volcanoes.length,
				warnings: payload.error ? [payload.error] : undefined
			}
		);
	} catch (error) {
		return handleApiError(error, 'GET /api/volcanoes');
	}
};
