import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseXml, findAll, text, localName } from '$lib/server/xml.ts';
import {
	parseCapRss,
	parseCapAlert,
	capPolygonsToMultiPolygon
} from '$lib/server/providers/bmkg/warning.ts';
import {
	normalizeWarnings,
	capSeverityToSeverity,
	eventNameToDisasterType,
	inferProvince
} from '$lib/server/providers/bmkg/warning-normalizer.ts';

describe('XML reader', () => {
	it('parses nested elements and text', () => {
		const root = parseXml('<a><b>hello</b><c><d>world</d></c></a>');
		expect(localName(root.name)).toBe('a');
		expect(text(root, 'b')).toBe('hello');
		expect(text(root, 'c')).toBe('world');
	});

	it('handles self-closing tags', () => {
		const root = parseXml('<a><empty/><b>1</b></a>');
		expect(findAll(root, 'empty')).toHaveLength(1);
		expect(text(root, 'b')).toBe('1');
	});

	it('decodes XML entities without double-decoding markup', () => {
		const root = parseXml('<a>&lt;b&gt; &amp;lt; &quot;q&quot;</a>');
		expect(root.text.trim()).toBe('<b> &lt; "q"');
	});

	it('strips namespace prefixes', () => {
		const root = parseXml('<cap:alert><cap:info>x</cap:info></cap:alert>');
		expect(localName(root.name)).toBe('alert');
		expect(text(root, 'info')).toBe('x');
	});

	it('ignores comments, declarations and doctype', () => {
		const root = parseXml('<?xml version="1.0"?><!DOCTYPE x><!-- note --><a>ok</a>');
		expect(root.text.trim()).toBe('ok');
	});

	it('throws on mismatched closing tags instead of guessing', () => {
		expect(() => parseXml('<a><b></a>')).toThrow(/does not match/);
	});

	it('throws on unclosed elements', () => {
		expect(() => parseXml('<a><b>')).toThrow(/unclosed/);
	});

	it('throws when there is no root element', () => {
		expect(() => parseXml('')).toThrow(/no root/);
	});
});

describe('CAP RSS parsing (live BMKG fixture)', () => {
	const rss = readFileSync('tests/fixtures/bmkg/nowcast-rss-id.xml', 'utf-8');

	it('extracts all active warnings', () => {
		const refs = parseCapRss(rss);
		expect(refs.length).toBeGreaterThan(5);
		for (const ref of refs) {
			expect(ref.url).toContain('bmkg.go.id/alerts/nowcast');
			expect(ref.title.length).toBeGreaterThan(3);
		}
	});

	it('derives the alert code and region group', () => {
		const refs = parseCapRss(rss);
		const withCode = refs.find((r) => r.code);
		expect(withCode).toBeDefined();
		expect(withCode?.code).toMatch(/^[A-Z]{3}\d+$/);
		expect(withCode?.regionCode).toHaveLength(3);
	});
});

describe('CAP alert parsing (live BMKG fixture)', () => {
	const cap = readFileSync('tests/fixtures/bmkg/nowcast-cap-detail-id.xml', 'utf-8');

	it('extracts official CAP fields', () => {
		const alert = parseCapAlert(cap, 'https://example.test/alert.xml');
		expect(alert.identifier.length).toBeGreaterThan(10);
		expect(alert.sender).toContain('bmkg.go.id');
		expect(alert.event).toBeTruthy();
		expect(['Immediate', 'Expected', 'Future', 'Past']).toContain(alert.urgency);
		expect(['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown']).toContain(alert.severity);
		expect(alert.headline).toContain('Hujan');
		expect(alert.areaDesc).toBeTruthy();
	});

	it('extracts every polygon from the alert', () => {
		const alert = parseCapAlert(cap, 'https://example.test/alert.xml');
		expect(alert.polygons.length).toBeGreaterThan(1);
		for (const polygon of alert.polygons) {
			// CAP encodes "lat,lon" pairs separated by spaces
			expect(polygon).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?(\s+-?\d+(\.\d+)?,-?\d+(\.\d+)?)+$/);
		}
	});

	it('parses effective and expires and flags the alert as live', () => {
		const alert = parseCapAlert(cap, 'https://example.test/alert.xml');
		expect(alert.effective).toBeTruthy();
		expect(alert.expires).toBeTruthy();
		expect(new Date(alert.expires!).getTime()).toBeGreaterThan(new Date(alert.effective!).getTime());
	});
});

describe('CAP polygon conversion', () => {
	it('inverts CAP lat,lon into GeoJSON lon,lat', () => {
		const geometry = capPolygonsToMultiPolygon(['-6.9,107.4 -7.0,107.5 -7.1,107.6']);
		expect(geometry).not.toBeNull();
		const ring = geometry!.coordinates[0][0];
		// First vertex must be [lon, lat] = [107.4, -6.9]
		expect(ring[0][0]).toBeCloseTo(107.4, 4);
		expect(ring[0][1]).toBeCloseTo(-6.9, 4);
	});

	it('closes unclosed rings', () => {
		const geometry = capPolygonsToMultiPolygon(['0,100 1,101 2,102']);
		const ring = geometry!.coordinates[0][0];
		expect(ring[0]).toEqual(ring[ring.length - 1]);
	});

	it('drops degenerate polygons with fewer than 3 points', () => {
		expect(capPolygonsToMultiPolygon(['0,100 1,101'])).toBeNull();
	});

	it('returns null for empty input rather than an invalid geometry', () => {
		expect(capPolygonsToMultiPolygon([])).toBeNull();
	});
});

describe('CAP severity mapping', () => {
	it('maps the official CAP vocabulary', () => {
		expect(capSeverityToSeverity('Extreme')).toBe('critical');
		expect(capSeverityToSeverity('Severe')).toBe('high');
		expect(capSeverityToSeverity('Moderate')).toBe('moderate');
		expect(capSeverityToSeverity('Minor')).toBe('low');
		expect(capSeverityToSeverity('Unknown')).toBe('unknown');
		expect(capSeverityToSeverity(null)).toBe('unknown');
	});
});

describe('disaster type inference', () => {
	it('classifies BMKG event names', () => {
		expect(eventNameToDisasterType('Hujan Lebat dan Petir')).toBe('extreme_weather');
		expect(eventNameToDisasterType('Banjir Bandang')).toBe('flash_flood');
		expect(eventNameToDisasterType('Banjir')).toBe('flood');
		expect(eventNameToDisasterType('Angin Puting Beliung')).toBe('tornado');
		expect(eventNameToDisasterType('Tanah Longsor')).toBe('landslide');
	});
});

describe('province inference', () => {
	it('recognises known provinces', () => {
		expect(inferProvince('sebagian wilayah Jawa Barat')).toBe('Jawa Barat');
		expect(inferProvince('wilayah Sumatera Utara')).toBe('Sumatera Utara');
	});

	it('returns undefined rather than guessing', () => {
		expect(inferProvince('Atlantis')).toBeUndefined();
		expect(inferProvince(null)).toBeUndefined();
	});
});

describe('warning normalizer', () => {
	const cap = readFileSync('tests/fixtures/bmkg/nowcast-cap-detail-id.xml', 'utf-8');
	const retrievedAt = '2026-09-29T09:00:00.000Z';

	it('produces early_warning events that use official BMPKG severity', () => {
		const alert = parseCapAlert(cap, 'https://example.test/alert.xml');
		const events = normalizeWarnings([alert], retrievedAt, { includeExpired: true });
		expect(events).toHaveLength(1);
		expect(events[0].category).toBe('early_warning');
		expect(events[0].severityIsInternal).toBe(false);
		expect(events[0].type).toBe('extreme_weather');
	});

	it('preserves the raw CAP vocabulary in metadata for verification', () => {
		const alert = parseCapAlert(cap, 'https://example.test/alert.xml');
		const [event] = normalizeWarnings([alert], retrievedAt, { includeExpired: true });
		// The raw CAP block lets users verify our rendering against BMKG directly.
		expect(event.metadata?.cap).toBeDefined();
		const capMeta = event.metadata?.cap as Record<string, unknown>;
		expect(capMeta.identifier).toBe(alert.identifier);
		expect(capMeta.severity).toBe(alert.severity);
		expect(event.metadata?.nature).toBe('official_early_warning');
		// BMKG does not always publish an instruction element; when absent we must
		// surface null rather than inventing guidance.
		expect(event.metadata).toHaveProperty('instruction');
		expect(event.metadata?.instruction).toBe(alert.instruction);
	});

	it('drops expired warnings by default', () => {
		const expired = {
			identifier: 'test-expired',
			sender: 'x@bmkg.go.id',
			sent: '2020-01-01T00:00:00+07:00',
			status: 'Actual',
			msgType: 'Alert',
			event: 'Hujan Lebat',
			urgency: 'Past',
			severity: 'Moderate',
			certainty: 'Observed',
			effective: '2020-01-01T00:00:00+07:00',
			expires: '2020-01-01T02:00:00+07:00',
			headline: 'Old warning',
			description: 'expired',
			instruction: null,
			areaDesc: 'Jawa Barat',
			web: null,
			contact: null,
			polygons: [],
			sourceUrl: 'https://example.test/old.xml'
		};
		expect(normalizeWarnings([expired], retrievedAt)).toHaveLength(0);
		expect(normalizeWarnings([expired], retrievedAt, { includeExpired: true })).toHaveLength(1);
	});

	it('deduplicates alerts sharing an identifier', () => {
		const alert = parseCapAlert(cap, 'https://example.test/alert.xml');
		const events = normalizeWarnings([alert, alert], retrievedAt, { includeExpired: true });
		expect(events).toHaveLength(1);
	});
});
