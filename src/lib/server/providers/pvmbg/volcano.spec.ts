import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseActivityTable, parseLevelCounts } from '$lib/server/providers/pvmbg/volcano';
import { lookupVolcanoReference } from '$lib/server/providers/pvmbg/volcano-reference';
import { normalizeVolcanoes } from '$lib/server/providers/pvmbg/volcano-normalizer';

const html = readFileSync('tests/fixtures/pvmbg/tingkat-aktivitas.html', 'utf-8');

describe('PVMBG activity table parser', () => {
	it('extracts level counters from the summary cards', () => {
		const counts = parseLevelCounts(html);
		expect(counts.IV).toBe(0);
		expect(counts.III).toBe(3);
		expect(counts.II).toBe(24);
		expect(counts.I).toBe(42);
	});

	it('extracts volcanoes with their official level', () => {
		const volcanoes = parseActivityTable(html);
		expect(volcanoes.length).toBeGreaterThan(50);

		const merapi = volcanoes.find((v) => v.name === 'Merapi');
		expect(merapi).toBeDefined();
		expect(merapi?.level).toBe('III');
		expect(merapi?.region).toContain('Yogyakarta');

		const semeru = volcanoes.find((v) => v.name === 'Semeru');
		expect(semeru?.level).toBe('III');

		// Level I volcanoes must be captured too, not just the alarming ones.
		expect(volcanoes.some((v) => v.level === 'I')).toBe(true);
	});

	it('attaches an official report deep link when present', () => {
		const volcanoes = parseActivityTable(html);
		const withReport = volcanoes.filter((v) => v.reportUrl);
		expect(withReport.length).toBeGreaterThan(50);
		expect(withReport[0].reportUrl).toContain('magma.esdm.go.id');
	});

	it('never produces blank names or duplicate level/name pairs', () => {
		const volcanoes = parseActivityTable(html);
		for (const volcano of volcanoes) {
			expect(volcano.name.trim().length).toBeGreaterThan(2);
		}
		const keys = volcanoes.map((v) => `${v.name}|${v.level}`);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe('volcano reference lookup', () => {
	it('resolves a plain name', () => {
		const ref = lookupVolcanoReference('Merapi');
		expect(ref?.latitude).toBeCloseTo(-7.54, 1);
	});

	it('resolves the "Name, Gunung" variant used by MAGMA', () => {
		expect(lookupVolcanoReference('Merapi, Gunung')?.name).toBe('Merapi');
		expect(lookupVolcanoReference('Slamet, Gunung')?.name).toBe('Slamet');
	});

	it('returns null rather than guessing for unknown volcanoes', () => {
		expect(lookupVolcanoReference('Definitely Not A Volcano')).toBeNull();
	});
});

describe('volcano normalizer', () => {
	const retrievedAt = '2026-09-29T08:00:00.000Z';

	it('maps PVMBG levels to severity without marking it internal', () => {
		const [volcano] = normalizeVolcanoes(
			[{ name: 'Merapi', region: 'Jawa Barat', level: 'III', levelLabel: 'Level III (Siaga)' }],
			retrievedAt
		);
		expect(volcano.severity).toBe('high');
		expect(volcano.severityIsInternal).toBe(false);
		expect(volcano.category).toBe('hazard');
	});

	it('flags volcanoes whose coordinates are unknown instead of inventing them', () => {
		const [volcano] = normalizeVolcanoes(
			[{ name: 'Unknown Peak', region: '', level: 'II', levelLabel: 'Level II (Waspada)' }],
			retrievedAt
		);
		expect(volcano.metadata.coordinatesKnown).toBe(false);
		expect(volcano.geometry).toBeUndefined();
	});

	it('produces valid GeoJSON [lon, lat] ordering', () => {
		const [volcano] = normalizeVolcanoes(
			[{ name: 'Semeru', region: 'Jawa Timur', level: 'III', levelLabel: 'Level III (Siaga)' }],
			retrievedAt
		);
		expect(volcano.geometry?.type).toBe('Point');
		const coords = volcano.geometry?.type === 'Point' ? volcano.geometry.coordinates : [];
		expect(coords[0]).toBeCloseTo(112.922, 2); // longitude first
		expect(coords[1]).toBeCloseTo(-8.108, 2); // latitude second
	});

	it('generates stable ids across runs', () => {
		const a = normalizeVolcanoes(
			[{ name: 'Semeru', region: '', level: 'III', levelLabel: '' }],
			retrievedAt
		);
		const b = normalizeVolcanoes(
			[{ name: 'Semeru', region: '', level: 'III', levelLabel: '' }],
			retrievedAt
		);
		expect(a[0].id).toBe(b[0].id);
	});
});
