import { z } from 'zod';
import type { DisasterType, DataCategory, Severity } from '$lib/types';

/**
 * Request validation. Every query parameter that reaches a provider is parsed
 * through these schemas, so malformed input is rejected before it can be
 * forwarded upstream (and before it can consume provider quota).
 */

export const DISASTER_TYPES = [
	'weather',
	'extreme_weather',
	'earthquake',
	'tsunami',
	'flood',
	'flash_flood',
	'landslide',
	'volcano',
	'wildfire',
	'drought',
	'high_wave',
	'abrasion',
	'tornado',
	'season',
	'other'
] as const satisfies readonly DisasterType[];

export const DATA_CATEGORIES = [
	'forecast',
	'early_warning',
	'current_event',
	'observation',
	'historical',
	'hazard',
	'risk'
] as const satisfies readonly DataCategory[];

export const SEVERITIES = ['unknown', 'low', 'moderate', 'high', 'critical'] as const satisfies readonly Severity[];

/** Geographic bounds matching Indonesia, padded slightly for border events. */
export const LAT_RANGE = { min: -12, max: 8 } as const;
export const LON_RANGE = { min: 93, max: 142 } as const;

export const coordinateSchema = z.object({
	lat: z.coerce.number().min(LAT_RANGE.min).max(LAT_RANGE.max),
	lng: z.coerce.number().min(LON_RANGE.min).max(LON_RANGE.max)
});

export const bboxSchema = z.object({
	minLon: z.coerce.number().min(-180).max(180),
	minLat: z.coerce.number().min(-90).max(90),
	maxLon: z.coerce.number().min(-180).max(180),
	maxLat: z.coerce.number().min(-90).max(90)
});

/**
 * Comma-separated list parser shared by all multi-value filters.
 * Empty values collapse to undefined so `?type=` behaves like "no filter".
 */
function csvEnum<T extends readonly [string, ...string[]]>(values: T) {
	return z
		.string()
		.optional()
		.transform((raw) =>
			raw
				? raw
						.split(',')
						.map((v) => v.trim())
						.filter(Boolean)
				: undefined
		)
		.pipe(z.array(z.enum(values)).optional());
}

export const eventFilterSchema = z.object({
	types: csvEnum(DISASTER_TYPES),
	categories: csvEnum(DATA_CATEGORIES),
	severities: csvEnum(SEVERITIES),
	provinces: z
		.string()
		.optional()
		.transform((raw) => (raw ? raw.split(',').map((v) => v.trim()).filter(Boolean) : undefined)),
	sources: z
		.string()
		.optional()
		.transform((raw) => (raw ? raw.split(',').map((v) => v.trim()).filter(Boolean) : undefined)),
	sinceHours: z.coerce.number().min(0).max(24 * 365).optional(),
	limit: z.coerce.number().int().min(1).max(2000).optional()
});

export type EventFilterInput = z.infer<typeof eventFilterSchema>;

/** adm4 village code, e.g. 31.71.01.1001 */
export const adm4Schema = z
	.string()
	.regex(/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/, 'Kode wilayah adm4 tidak valid');

export const adm2Schema = z.string().regex(/^\d{2}\.\d{2}$/, 'Kode wilayah adm2 tidak valid');

export const adm1Schema = z.string().regex(/^\d{2}$/, 'Kode wilayah adm1 tidak valid');

export const searchSchema = z.object({
	q: z.string().trim().min(2, 'Kata kunci minimal 2 karakter').max(80),
	limit: z.coerce.number().int().min(1).max(50).optional()
});

export const radiusSchema = z.object({
	lat: z.coerce.number().min(LAT_RANGE.min).max(LAT_RANGE.max),
	lng: z.coerce.number().min(LON_RANGE.min).max(LON_RANGE.max),
	radiusKm: z.coerce.number().min(1).max(500).default(50),
	limit: z.coerce.number().int().min(1).max(500).optional()
});

/** Time windows accepted by history/statistics endpoints. */
export const windowSchema = z.enum(['24h', '7d', '30d', '3m', '1y']).default('7d');

export const WINDOW_MS: Record<z.infer<typeof windowSchema>, number> = {
	'24h': 24 * 3600_000,
	'7d': 7 * 24 * 3600_000,
	'30d': 30 * 24 * 3600_000,
	'3m': 90 * 24 * 3600_000,
	'1y': 365 * 24 * 3600_000
};

/** Parses URLSearchParams into a plain object for Zod. */
export function paramsToObject(url: URL): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of url.searchParams) {
		if (value !== '') out[key] = value;
	}
	return out;
}

/**
 * Validates query params, returning a discriminated result so endpoints can
 * respond with a proper 400 instead of throwing.
 */
export function parseQuery<T extends z.ZodType>(
	schema: T,
	url: URL
): { ok: true; data: z.infer<T> } | { ok: false; message: string } {
	const result = schema.safeParse(paramsToObject(url));
	if (!result.success) {
		const first = result.error.issues[0];
		return {
			ok: false,
			message: first ? `${first.path.join('.') || 'parameter'}: ${first.message}` : 'Parameter tidak valid'
		};
	}
	return { ok: true, data: result.data };
}
