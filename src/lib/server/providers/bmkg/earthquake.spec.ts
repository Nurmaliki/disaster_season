import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	parseCoordinates,
	parseDepth,
	parseMagnitude,
	magnitudeSeverity,
	isTsunamiPotential,
	earthquakeEventId,
	normalizeEarthquakes
} from '$lib/server/providers/bmkg/earthquake-normalizer';

const autogempa = JSON.parse(readFileSync('tests/fixtures/bmkg/autogempa.json', 'utf-8'));
const gempaterkini = JSON.parse(readFileSync('tests/fixtures/bmkg/gempaterkini.json', 'utf-8'));
const gempadirasakan = JSON.parse(readFileSync('tests/fixtures/bmkg/gempadirasakan.json', 'utf-8'));

const toArray = (payload: unknown): unknown[] => {
	const gempa = (payload as { Infogempa: { gempa: unknown } }).Infogempa.gempa;
	return Array.isArray(gempa) ? gempa : [gempa];
};

describe('coordinate parsing', () => {
	it('reads BMKG "lat,lon" order', () => {
		expect(parseCoordinates('5.19,94.41')).toEqual({ lat: 5.19, lon: 94.41 });
		expect(parseCoordinates('-6.2,106.8')).toEqual({ lat: -6.2, lon: 106.8 });
	});

	it('rejects unusable coordinates rather than returning zeroes', () => {
		expect(parseCoordinates(undefined)).toBeNull();
		expect(parseCoordinates('')).toBeNull();
		expect(parseCoordinates('abc,def')).toBeNull();
		expect(parseCoordinates('5.19')).toBeNull();
		expect(parseCoordinates('91,200')).toBeNull();
	});
});

describe('depth and magnitude parsing', () => {
	it('extracts numeric depth from "10 km"', () => {
		expect(parseDepth('10 km')).toBe(10);
		expect(parseDepth('123 km')).toBe(123);
	});

	it('returns null for unparseable depth', () => {
		expect(parseDepth(undefined)).toBeNull();
		expect(parseDepth('--')).toBeNull();
	});

	it('parses magnitudes including decimal comma', () => {
		expect(parseMagnitude('5.2')).toBe(5.2);
		expect(parseMagnitude('5,2')).toBe(5.2);
		expect(parseMagnitude(undefined)).toBeNull();
	});
});

describe('magnitude severity classification', () => {
	it('bands magnitudes into our documented internal scale', () => {
		expect(magnitudeSeverity(7.5)).toBe('critical');
		expect(magnitudeSeverity(6.1)).toBe('high');
		expect(magnitudeSeverity(5.2)).toBe('moderate');
		expect(magnitudeSeverity(3.1)).toBe('low');
		expect(magnitudeSeverity(null)).toBe('unknown');
	});
});

describe('tsunami potential detection', () => {
	it('reads BMKG phrasing correctly', () => {
		expect(isTsunamiPotential('Tidak berpotensi tsunami')).toBe(false);
		expect(isTsunamiPotential('Berpotensi tsunami')).toBe(true);
		expect(isTsunamiPotential(undefined)).toBe(false);
	});
});

describe('earthquake identity', () => {
	it('prefers the BMKG guid when present', () => {
		const id = earthquakeEventId({ guid: 'abc123' } as never);
		expect(id).toBe('bmkg:quake:abc123');
	});

	it('derives a stable hash when no guid exists', () => {
		const record = {
			DateTime: '2026-09-21T23:48:13+00:00',
			Coordinates: '4.74,125.30',
			Magnitude: '5.2',
			Kedalaman: '10 km'
		};
		const a = earthquakeEventId(record as never);
		const b = earthquakeEventId(record as never);
		expect(a).toBe(b);
		expect(a).toMatch(/^bmkg:quake:[0-9a-f]{16}$/);
	});

	it('produces different ids for genuinely different events', () => {
		const a = earthquakeEventId({
			DateTime: '2026-01-01T00:00:00Z',
			Coordinates: '1,100',
			Magnitude: '5',
			Kedalaman: '10 km'
		} as never);
		const b = earthquakeEventId({
			DateTime: '2026-01-01T00:00:00Z',
			Coordinates: '2,101',
			Magnitude: '5',
			Kedalaman: '10 km'
		} as never);
		expect(a).not.toBe(b);
	});
});

describe('earthquake normalization against live BMKG fixtures', () => {
	const retrievedAt = '2026-09-29T09:00:00.000Z';

	it('normalizes the latest event feed', () => {
		const events = normalizeEarthquakes(toArray(autogempa) as never, retrievedAt, {
			feed: 'autogempa'
		});
		expect(events).toHaveLength(1);
		const [event] = events;
		expect(event.type).toBe('earthquake');
		expect(event.category).toBe('current_event');
		expect(event.severityIsInternal).toBe(true);
		expect(event.geometry?.type).toBe('Point');
		expect(event.source.name).toBe('BMKG');
		expect(event.metadata?.nature).toBe('occurred_event');
	});

	it('normalizes the recent-events feed', () => {
		const events = normalizeEarthquakes(toArray(gempaterkini) as never, retrievedAt, {
			feed: 'gempaterkini'
		});
		expect(events.length).toBeGreaterThan(5);
		for (const event of events) {
			expect(event.occurredAt).toBeTruthy();
			expect(Number.isFinite(event.location.latitude)).toBe(true);
			expect(Number.isFinite(event.location.longitude)).toBe(true);
		}
	});

	it('emits GeoJSON with longitude first', () => {
		const events = normalizeEarthquakes(toArray(autogempa) as never, retrievedAt, {
			feed: 'autogempa'
		});
		const coords = events[0].geometry?.type === 'Point' ? events[0].geometry.coordinates : [];
		expect(coords[0]).toBeCloseTo(94.41, 2); // longitude
		expect(coords[1]).toBeCloseTo(5.19, 2); // latitude
	});

	it('normalizes felt events and records the Dirasakan text', () => {
		const events = normalizeEarthquakes(toArray(gempadirasakan) as never, retrievedAt, {
			feed: 'gempadirasakan'
		});
		expect(events.length).toBeGreaterThan(3);
		const felt = events.find((e) => e.metadata?.feltText);
		expect(felt).toBeDefined();
	});

	it('never invents a tsunami prediction, only mirrors BMKG wording', () => {
		const events = normalizeEarthquakes(toArray(autogempa) as never, retrievedAt, {
			feed: 'autogempa'
		});
		const [event] = events;
		expect(typeof event.metadata?.tsunamiPotential).toBe('boolean');
		expect(event.metadata?.tsunamiPotentialText).toBeTruthy();
	});

	it('deduplicates records repeated across the same feed', () => {
		const raw = toArray(autogempa) as never[];
		const doubled = [...raw, ...raw] as never;
		const events = normalizeEarthquakes(doubled, retrievedAt, { feed: 'autogempa' });
		expect(events).toHaveLength(1);
	});

	it('drops records with invalid coordinates instead of placing them at 0,0', () => {
		const bad = [
			{
				Tanggal: '28 Sep 2026',
				Jam: '21:43:09 WIB',
				DateTime: '2026-09-28T14:43:09+00:00',
				Coordinates: 'not,a,coordinate',
				Magnitude: '5.0',
				Kedalaman: '10 km',
				Wilayah: 'Test',
				Potensi: 'Tidak berpotensi tsunami'
			}
		];
		expect(normalizeEarthquakes(bad as never, retrievedAt, { feed: 'autogempa' })).toHaveLength(0);
	});

	it('drops records with an unusable timestamp', () => {
		const bad = [
			{
				Tanggal: '',
				Jam: '',
				DateTime: 'not-a-date',
				Coordinates: '1,100',
				Magnitude: '5.0',
				Kedalaman: '10 km',
				Wilayah: 'Test',
				Potensi: 'Tidak berpotensi tsunami'
			}
		];
		expect(normalizeEarthquakes(bad as never, retrievedAt, { feed: 'autogempa' })).toHaveLength(0);
	});
});
