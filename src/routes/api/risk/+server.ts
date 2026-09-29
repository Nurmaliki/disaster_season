import type { RequestHandler } from './$types';
import { aggregateEvents, queryEvents } from '$lib/server/services/aggregate';
import {
	assessRisk,
	RISK_DISCLAIMER,
	RISK_WEIGHTS,
	RISK_LEVEL_BANDS
} from '$lib/server/risk/engine';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';
import { paramsToObject } from '$lib/server/api/validation';
import { z } from 'zod';
import { findProvince } from '$lib/utils/regions';

/**
 * GET /api/risk
 *
 * The internal Risk Score indicator.
 *
 * This is NOT an official warning. The response always includes the mandatory
 * disclaimer and the full factor breakdown, and this endpoint deliberately does
 * not exist under any "warning"/"alert" path so it cannot be confused with the
 * BMKG CAP endpoint.
 *
 *   ?province=31        -> score scoped to a province
 *   ?adm4=...           -> score scoped to a village (its province is used)
 *   (no params)         -> national score
 */

const querySchema = z.object({
	province: z
		.string()
		.regex(/^\d{2}$/)
		.optional(),
	adm4: z
		.string()
		.regex(/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/)
		.optional()
});

export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'risk'), { windowMs: 60_000, max: 60 });
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

		const provinceCode =
			parsed.data.province ?? (parsed.data.adm4 ? parsed.data.adm4.slice(0, 2) : undefined);
		const province = provinceCode ? findProvince(provinceCode) : undefined;

		const aggregate = await aggregateEvents();

		// Scope events to the province when the events carry a province label
		// (which is how BMKG CAP alerts and PVMBG levels are tagged). Events
		// without a province are only included in the national view.
		const relevant = province
			? queryEvents(aggregate.events, { provinces: [province.name] })
			: aggregate.events;

		const assessment = assessRisk({
			events: relevant,
			month: new Date().getMonth() + 1
		});

		return apiSuccess(
			{
				scope: province
					? { level: 'province' as const, code: province.code, name: province.name }
					: { level: 'country' as const, code: 'ID', name: 'Indonesia' },
				...assessment,
				weights: RISK_WEIGHTS,
				bands: RISK_LEVEL_BANDS
			},
			{
				source: 'Indikator internal aplikasi',
				updatedAt: assessment.generatedAt,
				cached: true,
				partial: aggregate.partial,
				warnings: [RISK_DISCLAIMER]
			}
		);
	} catch (error) {
		return handleApiError(error, 'GET /api/risk');
	}
};
