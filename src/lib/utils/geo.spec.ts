import { describe, expect, it } from 'vitest';
import {
	haversineKm,
	withinRadius,
	pointInRing,
	pointInGeometry,
	geometryBounds,
	geometryCenter,
	isWithinIndonesia
} from '$lib/utils/geo.ts';

describe('haversine distance', () => {
	it('returns zero for identical points', () => {
		expect(haversineKm(-6.2, 106.8, -6.2, 106.8)).toBeCloseTo(0, 5);
	});

	it('matches a known distance within tolerance', () => {
		// Jakarta (-6.2, 106.8) to Bandung (-6.9, 107.6) is ~110 km
		const distance = haversineKm(-6.2, 106.8, -6.9, 107.6);
		expect(distance).toBeGreaterThan(95);
		expect(distance).toBeLessThan(130);
	});

	it('is symmetric', () => {
		const a = haversineKm(-6.2, 106.8, 1.5, 124.8);
		const b = haversineKm(1.5, 124.8, -6.2, 106.8);
		expect(a).toBeCloseTo(b, 6);
	});

	it('measures antipodal points as roughly half the circumference', () => {
		const distance = haversineKm(0, 0, 0, 180);
		expect(distance).toBeCloseTo(20015, -2);
	});
});

describe('radius filtering', () => {
	const items = [
		{ id: 'near', latitude: -6.21, longitude: 106.81 },
		{ id: 'mid', latitude: -6.5, longitude: 107.0 },
		{ id: 'far', latitude: 3.58, longitude: 98.67 }
	];

	it('keeps only items inside the radius, nearest first', () => {
		const result = withinRadius(items, { latitude: -6.2, longitude: 106.8 }, 100);
		expect(result.map((r) => r.id)).toEqual(['near', 'mid']);
		expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
	});

	it('returns an empty array when nothing is in range', () => {
		expect(withinRadius(items, { latitude: -40, longitude: 100 }, 5)).toHaveLength(0);
	});

	it('ignores items with non-finite coordinates', () => {
		const dirty = [...items, { id: 'bad', latitude: Number.NaN, longitude: 100 }];
		const result = withinRadius(dirty, { latitude: -6.2, longitude: 106.8 }, 100);
		expect(result.map((r) => r.id)).not.toContain('bad');
	});
});

describe('point in polygon', () => {
	// Unit square in [lon, lat] order
	const square = [
		[0, 0],
		[2, 0],
		[2, 2],
		[0, 2],
		[0, 0]
	];

	it('detects inside and outside points', () => {
		expect(pointInRing(1, 1, square)).toBe(true);
		expect(pointInRing(3, 1, square)).toBe(false);
		expect(pointInRing(-1, 1, square)).toBe(false);
	});

	it('handles a polygon with a hole', () => {
		const withHole: GeoJSON.Polygon = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[10, 0],
					[10, 10],
					[0, 10],
					[0, 0]
				],
				[
					[4, 4],
					[6, 4],
					[6, 6],
					[4, 6],
					[4, 4]
				]
			]
		};
		expect(pointInGeometry(1, 1, withHole)).toBe(true);
		expect(pointInGeometry(5, 5, withHole)).toBe(false);
	});

	it('handles MultiPolygon', () => {
		const multi: GeoJSON.MultiPolygon = {
			type: 'MultiPolygon',
			coordinates: [
				[
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 1],
						[0, 0]
					]
				],
				[
					[
						[10, 10],
						[11, 10],
						[11, 11],
						[10, 11],
						[10, 10]
					]
				]
			]
		};
		expect(pointInGeometry(0.5, 0.5, multi)).toBe(true);
		expect(pointInGeometry(10.5, 10.5, multi)).toBe(true);
		expect(pointInGeometry(5, 5, multi)).toBe(false);
	});
});

describe('geometry bounds and centre', () => {
	it('computes bounds for a polygon', () => {
		const geometry: GeoJSON.Polygon = {
			type: 'Polygon',
			coordinates: [
				[
					[100, -5],
					[110, -5],
					[110, 0],
					[100, 0],
					[100, -5]
				]
			]
		};
		expect(geometryBounds(geometry)).toEqual({ minLon: 100, minLat: -5, maxLon: 110, maxLat: 0 });
	});

	it('computes the centre', () => {
		const geometry: GeoJSON.Point = { type: 'Point', coordinates: [110, -5] };
		expect(geometryCenter(geometry)).toEqual({ latitude: -5, longitude: 110 });
	});

	it('returns null for an empty geometry instead of Infinity', () => {
		const empty: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [] };
		expect(geometryBounds(empty)).toBeNull();
		expect(geometryCenter(empty)).toBeNull();
	});
});

describe('Indonesia bounding box validation', () => {
	it('accepts real Indonesian coordinates', () => {
		expect(isWithinIndonesia(-6.2, 106.8)).toBe(true); // Jakarta
		expect(isWithinIndonesia(3.58, 98.67)).toBe(true); // Medan
		expect(isWithinIndonesia(-2.53, 140.71)).toBe(true); // Jayapura
	});

	it('rejects coordinates outside Indonesia', () => {
		expect(isWithinIndonesia(0, 0)).toBe(false);
		expect(isWithinIndonesia(51.5, -0.1)).toBe(false); // London
		expect(isWithinIndonesia(Number.NaN, 106)).toBe(false);
	});
});
