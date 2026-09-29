import { describe, it, expect } from 'vitest';
import { getSeasonContext } from '$lib/server/services/seasons';

/**
 * Seasonal context is a coarse, calendar-derived phase. These tests lock in the
 * monsoon mapping so the UI copy ("musim hujan" etc.) stays consistent with the
 * value used by the risk engine.
 */

describe('getSeasonContext', () => {
	it('reports the rainy season at the start of the year', () => {
		const context = getSeasonContext(new Date('2026-01-15T00:00:00Z'));
		expect(context.phase).toBe('hujan');
		expect(context.factor).toBeGreaterThan(0.8);
	});

	it('reports the dry season in the middle of the year', () => {
		const context = getSeasonContext(new Date('2026-08-15T00:00:00Z'));
		expect(context.phase).toBe('kemarau');
	});

	it('reports a transition in the shoulder months', () => {
		expect(getSeasonContext(new Date('2026-11-15T00:00:00Z')).phase).toBe('pancaroba');
		expect(getSeasonContext(new Date('2026-03-15T00:00:00Z')).phase).toBe('pancaroba');
	});

	it('carries a human-readable phase label and explanation', () => {
		const context = getSeasonContext(new Date('2026-01-15T00:00:00Z'));
		expect(context.phaseLabel).toBeTruthy();
		expect(context.explanation.length).toBeGreaterThan(0);
		expect(context.typicalMonths.length).toBeGreaterThan(0);
	});

	it('always states that the phase is coarse, not a regional forecast', () => {
		const context = getSeasonContext(new Date('2026-06-01T00:00:00Z'));
		expect(context.notes.some((note) => note.includes('nasional'))).toBe(true);
		expect(context.notes.some((note) => note.includes('prakiraan awal musim'))).toBe(true);
	});

	it('is deterministic for a given date', () => {
		const date = new Date('2026-02-01T00:00:00Z');
		expect(getSeasonContext(date).phase).toBe(getSeasonContext(date).phase);
		expect(getSeasonContext(date).month).toBe(2);
	});
});
