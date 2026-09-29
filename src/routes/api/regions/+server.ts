import type { RequestHandler } from './$types';
import {
	apiSuccess,
	apiFailure,
	handleApiError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';
import { searchRegions, PROVINCES, regenciesOfProvince, findProvince } from '$lib/utils/regions';
import { paramsToObject } from '$lib/server/api/validation';
import { z } from 'zod';

/**
 * GET /api/regions
 *
 * Administrative region lookup backed by the bundled BPS/BIG `Kode Wilayah`
 * table. This is a static reference dataset — it never calls an external API —
 * so it is always available and safe to cache aggressively.
 *
 *   ?q=bandung          -> fuzzy search across provinces and regencies
 *   ?province=32        -> all regencies of a province
 *   (no params)         -> the province list
 */

const querySchema = z.object({
	q: z.string().trim().min(2).max(80).optional(),
	province: z
		.string()
		.regex(/^\d{2}$/)
		.optional(),
	limit: z.coerce.number().int().min(1).max(50).default(15)
});

export const GET: RequestHandler = async ({ url, request }) => {
	const limited = checkRateLimit(clientKey(request, 'regions'), { windowMs: 60_000, max: 240 });
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

		const { q, province, limit } = parsed.data;
		const updatedAt = new Date().toISOString();

		if (q) {
			const results = searchRegions(q, limit);
			return apiSuccess(results, {
				source: 'BPS/BIG Kode Wilayah',
				updatedAt,
				cached: true,
				count: results.length
			});
		}

		if (province) {
			const parent = findProvince(province);
			const regencies = regenciesOfProvince(province);
			return apiSuccess(
				{
					province: parent
						? { code: parent.code, name: parent.name, level: 'province' as const, parentCode: null }
						: null,
					regencies: regencies.map((r) => ({
						code: r.code,
						name: r.name,
						level: 'regency' as const,
						parentCode: province,
						latitude: r.latitude,
						longitude: r.longitude
					}))
				},
				{ source: 'BPS/BIG Kode Wilayah', updatedAt, cached: true }
			);
		}

		const provinces = PROVINCES.map((p) => ({
			code: p.code,
			name: p.name,
			level: 'province' as const,
			parentCode: null,
			latitude: p.latitude,
			longitude: p.longitude
		}));

		return apiSuccess(provinces, {
			source: 'BPS/BIG Kode Wilayah',
			updatedAt,
			cached: true,
			count: provinces.length
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/regions');
	}
};
