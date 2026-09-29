import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFirmsCsv, INDONESIA_BBOX } from '$lib/server/providers/firms/wildfire';
import {
	confidenceSeverity,
	hotspotTimestamp,
	hotspotEventId,
	normalizeHotspots,
	MAX_HOTSPOTS
} from '$lib/server/providers/firms/wildfire-normalizer';
import type { FirmsHotspot } from '$lib/server/providers/firms/wildfire';

const csv = readFileSync('tests/fixtures/firms/hotspots.csv', 'utf-8');

describe('FIRMS CSV parsing', () => {
	it('parses header-driven columns from a real VIIRS response', () => {
		const hotspots = parseFirmsCsv(csv);
		expect(hotspots).toHaveLength(6);

		const first = hotspots[0];
		expect(first.latitude).toBeCloseTo(-2.9812, 4);
		expect(first.longitude).toBeCloseTo(104.7521, 4);
		expect(first.brightness).toBeCloseTo(330.1, 1);
		expect(first.acqDate).toBe('2026-09-28');
		expect(first.acqTime).toBe('0512');
		expect(first.satellite).toBe('N20');
		expect(first.instrument).toBe('VIIRS');
		expect(first.confidence).toBe('nominal');
		expect(first.frp).toBeCloseTo(6.4, 1);
		expect(first.daynight).toBe('D');
	});

	it('returns nothing for a header-only or empty body', () => {
		expect(parseFirmsCsv('latitude,longitude\n')).toEqual([]);
		expect(parseFirmsCsv('')).toEqual([]);
	});

	it('returns nothing when required columns are missing', () => {
		expect(parseFirmsCsv('foo,bar\n1,2\n')).toEqual([]);
	});

	it('drops rows with unparseable coordinates rather than guessing', () => {
		const body =
			'latitude,longitude,acq_date,acq_time\nabc,def,2026-01-01,0100\n-2,118,2026-01-01,0100\n';
		const hotspots = parseFirmsCsv(body);
		expect(hotspots).toHaveLength(1);
		expect(hotspots[0].latitude).toBe(-2);
	});

	it('publishes Indonesia bbox in west,south,east,north order', () => {
		expect(INDONESIA_BBOX).toBe('94,-12,142,8');
	});
});

describe('confidence to severity (our own classification)', () => {
	it('maps banded confidence', () => {
		expect(confidenceSeverity('high')).toBe('high');
		expect(confidenceSeverity('nominal')).toBe('moderate');
		expect(confidenceSeverity('low')).toBe('low');
	});

	it('maps percentage confidence', () => {
		expect(confidenceSeverity('95')).toBe('high');
		expect(confidenceSeverity('60%')).toBe('moderate');
		expect(confidenceSeverity('20')).toBe('low');
	});

	it('is unknown when confidence is absent or unrecognised', () => {
		expect(confidenceSeverity(null)).toBe('unknown');
		expect(confidenceSeverity('weird')).toBe('unknown');
	});
});

describe('hotspot timestamp', () => {
	it('combines date and HHMM time as UTC', () => {
		expect(hotspotTimestamp('2026-09-28', '0512')).toBe('2026-09-28T05:12:00.000Z');
	});

	it('handles a 3-digit time by zero-padding', () => {
		expect(hotspotTimestamp('2026-09-28', '512')).toBe('2026-09-28T05:12:00.000Z');
	});

	it('defaults to midnight when time is absent', () => {
		expect(hotspotTimestamp('2026-09-28', null)).toBe('2026-09-28T00:00:00.000Z');
	});

	it('returns null for a missing or malformed date', () => {
		expect(hotspotTimestamp(null, '0512')).toBeNull();
		expect(hotspotTimestamp('28-09-2026', '0512')).toBeNull();
	});
});

describe('hotspot event id', () => {
	const base: FirmsHotspot = {
		latitude: -2.9812,
		longitude: 104.7521,
		brightness: 330.1,
		acqDate: '2026-09-28',
		acqTime: '0512',
		satellite: 'N20',
		instrument: 'VIIRS',
		confidence: 'nominal',
		frp: 6.4,
		daynight: 'D'
	};

	it('is stable for the same detection', () => {
		expect(hotspotEventId(base)).toBe(hotspotEventId({ ...base }));
	});

	it('differs when the time or position differs', () => {
		expect(hotspotEventId(base)).not.toBe(hotspotEventId({ ...base, acqTime: '0513' }));
		expect(hotspotEventId(base)).not.toBe(hotspotEventId({ ...base, latitude: -2.98 }));
	});
});

describe('hotspot normalization', () => {
	it('emits observation events, never current_event', () => {
		const events = normalizeHotspots(parseFirmsCsv(csv), '2026-09-28T06:00:00.000Z');
		expect(events).toHaveLength(6);
		for (const event of events) {
			expect(event.type).toBe('wildfire');
			expect(event.category).toBe('observation');
			expect(event.severityIsInternal).toBe(true);
			expect(event.source.name).toBe('NASA FIRMS');
			expect(event.geometry).toEqual({
				type: 'Point',
				coordinates: [event.location.longitude, event.location.latitude]
			});
			expect(event.metadata?.nature).toBe('satellite_detection');
		}
	});

	it('labels the event as a hotspot, not a confirmed fire', () => {
		const [event] = normalizeHotspots(parseFirmsCsv(csv), '2026-09-28T06:00:00.000Z');
		expect(event.title).toContain('Titik Panas');
		expect(event.description).toContain('Bukan kebakaran yang terkonfirmasi');
	});

	it('drops detections outside Indonesia', () => {
		const outside: FirmsHotspot = {
			latitude: 40.0,
			longitude: 104.0,
			brightness: 300,
			acqDate: '2026-09-28',
			acqTime: '0512',
			satellite: 'N20',
			instrument: 'VIIRS',
			confidence: 'high',
			frp: 5,
			daynight: 'D'
		};
		expect(normalizeHotspots([outside], '2026-09-28T06:00:00.000Z')).toHaveLength(0);
	});

	it('caps output and marks truncation honestly', () => {
		const many: FirmsHotspot[] = [];
		for (let i = 0; i < MAX_HOTSPOTS + 25; i++) {
			many.push({
				latitude: -2 + i * 0.0001,
				longitude: 118 + i * 0.0001,
				brightness: 320,
				acqDate: '2026-09-28',
				acqTime: '0512',
				satellite: 'N20',
				instrument: 'VIIRS',
				confidence: 'nominal',
				frp: 4,
				daynight: 'D'
			});
		}
		const events = normalizeHotspots(many, '2026-09-28T06:00:00.000Z');
		expect(events).toHaveLength(MAX_HOTSPOTS);
		expect(events[0].metadata?.truncated).toBe(true);
		expect(events[0].metadata?.totalDetections).toBe(MAX_HOTSPOTS + 25);
	});

	it('does not mark truncation when under the cap', () => {
		const events = normalizeHotspots(parseFirmsCsv(csv), '2026-09-28T06:00:00.000Z');
		expect(events[0].metadata?.truncated).toBeUndefined();
	});
});
