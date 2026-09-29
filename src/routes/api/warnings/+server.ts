import type { RequestHandler } from './$types';
import { getWarnings } from '$lib/server/services/aggregate';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';
import { queryEvents } from '$lib/server/services/aggregate';
import { paramsToObject } from '$lib/server/api/validation';
import { z } from 'zod';

/**
 * GET /api/warnings
 *
 * BMKG CAP early warnings only. This endpoint is deliberately narrow: it returns
 * `early_warning` category events exclusively, so a client can never mistake a
 * forecast or observation for an official warning.
 */

const querySchema = z.object({
	level: z.enum(['all', 'severe', 'extreme']).default('all'),
	province: z.string().trim().min(2).max(80).optional(),
	includeExpired: z.enum(['0', '1']).default('0'),
	limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'warnings'), { windowMs: 60_000, max: 120 });
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

		const { level, province, includeExpired, limit } = parsed.data;
		const payload = await getWarnings();
		const now = Date.now();

		let warnings = queryEvents(payload.events, { categories: ['early_warning'] });

		// Expired warnings are excluded by default because presenting an ended
		// warning as active would be dangerous.
		if (includeExpired === '0') {
			warnings = warnings.filter((event) => {
				if (!event.validUntil) return true;
				const until = new Date(event.validUntil).getTime();
				return !Number.isFinite(until) || until >= now;
			});
		}

		if (level !== 'all') {
			// Filter on the raw CAP severity (preserved in metadata), not our
			// mapped severity, so the official vocabulary is what is queried.
			warnings = warnings.filter((event) => {
				const cap = event.metadata?.cap as { severity?: string } | undefined;
				return (cap?.severity ?? '').toLowerCase() === level;
			});
		}

		if (province) {
			const needle = province.toLowerCase();
			warnings = warnings.filter((event) =>
				(event.location.province ?? '').toLowerCase().includes(needle)
			);
		}

		warnings = warnings.slice(0, limit);

		return apiSuccess(warnings, {
			source: 'BMKG — Peringatan Dini Cuaca (CAP)',
			updatedAt: payload.retrievedAt,
			cached: payload.cached,
			stale: payload.stale,
			partial: payload.degraded,
			count: warnings.length,
			warnings: payload.error ? [payload.error] : undefined
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/warnings');
	}
};
