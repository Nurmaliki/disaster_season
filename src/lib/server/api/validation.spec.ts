import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
	adm1Schema,
	adm2Schema,
	adm4Schema,
	eventFilterSchema,
	parseQuery,
	paramsToObject,
	radiusSchema,
	windowSchema,
	WINDOW_MS,
	LAT_RANGE,
	LON_RANGE
} from '$lib/server/api/validation';

/**
 * Validation is the boundary that keeps malformed input from reaching upstream
 * providers. These tests lock in the accepted/rejected shapes.
 */

describe('adm code schemas', () => {
	it('accepts a valid adm4 code', () => {
		expect(adm4Schema.safeParse('31.71.01.1001').success).toBe(true);
	});

	it('rejects an adm4 with the wrong segment widths', () => {
		expect(adm4Schema.safeParse('31.71.01.100').success).toBe(false);
		expect(adm4Schema.safeParse('3.71.01.1001').success).toBe(false);
	});

	it('rejects a non-numeric adm4', () => {
		expect(adm4Schema.safeParse('ab.cd.ef.ghij').success).toBe(false);
	});

	it('accepts adm1 and adm2', () => {
		expect(adm1Schema.safeParse('31').success).toBe(true);
		expect(adm2Schema.safeParse('31.71').success).toBe(true);
		expect(adm1Schema.safeParse('311').success).toBe(false);
		expect(adm2Schema.safeParse('31.7').success).toBe(false);
	});
});

describe('event filter schema', () => {
	it('parses comma separated enum lists', () => {
		const result = eventFilterSchema.parse({ types: 'earthquake,flood', severities: 'high,low' });
		expect(result.types).toEqual(['earthquake', 'flood']);
		expect(result.severities).toEqual(['high', 'low']);
	});

	it('treats an empty value as "no filter"', () => {
		const result = eventFilterSchema.parse({});
		expect(result.types).toBeUndefined();
	});

	it('rejects an unknown disaster type', () => {
		expect(eventFilterSchema.safeParse({ types: 'earthquake,alien_invasion' }).success).toBe(false);
	});

	it('coerces the limit and enforces bounds', () => {
		expect(eventFilterSchema.parse({ limit: '50' }).limit).toBe(50);
		expect(eventFilterSchema.safeParse({ limit: '0' }).success).toBe(false);
		expect(eventFilterSchema.safeParse({ limit: '99999' }).success).toBe(false);
	});
});

describe('radius schema', () => {
	it('coerces numbers and applies the default radius', () => {
		const result = radiusSchema.parse({ lat: '-6.2', lng: '106.8' });
		expect(result.lat).toBeCloseTo(-6.2);
		expect(result.radiusKm).toBe(50);
	});

	it('rejects coordinates outside Indonesia', () => {
		expect(radiusSchema.safeParse({ lat: '51.5', lng: '0.1' }).success).toBe(false);
	});

	it('accepts coordinates inside the Indonesia bounding ranges', () => {
		expect(
			radiusSchema.safeParse({ lat: String(LAT_RANGE.min + 1), lng: String(LON_RANGE.min + 1) })
				.success
		).toBe(true);
	});
});

describe('window schema', () => {
	it('defaults to 7d', () => {
		expect(windowSchema.parse(undefined)).toBe('7d');
	});

	it('maps every window to milliseconds', () => {
		for (const key of ['24h', '7d', '30d', '3m', '1y'] as const) {
			expect(WINDOW_MS[key]).toBeGreaterThan(0);
		}
		expect(WINDOW_MS['24h']).toBe(24 * 3600_000);
	});

	it('rejects an unknown window', () => {
		expect(windowSchema.safeParse('42d').success).toBe(false);
	});
});

describe('paramsToObject', () => {
	it('omits empty values and de-duplicates into a plain object', () => {
		const url = new URL('https://x.test/?a=1&b=&c=3');
		expect(paramsToObject(url)).toEqual({ a: '1', c: '3' });
	});
});

describe('parseQuery', () => {
	it('returns a discriminated ok result on success', () => {
		// `parseQuery` feeds the whole query object to the schema, so endpoints
		// always pass an object schema (matching how the routes use it).
		const schema = z.object({ window: windowSchema });
		const url = new URL('https://x.test/?window=30d');
		const result = parseQuery(schema, url);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data.window).toBe('30d');
	});

	it('applies schema defaults for omitted params', () => {
		const schema = z.object({ window: windowSchema });
		const result = parseQuery(schema, new URL('https://x.test/'));
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data.window).toBe('7d');
	});

	it('returns a message on failure instead of throwing', () => {
		const schema = z.object({ window: windowSchema });
		const result = parseQuery(schema, new URL('https://x.test/?window=nope'));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
	});
});
