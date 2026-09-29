import { describe, expect, it } from 'vitest';
import type { DisasterEvent } from '$lib/types';
import {
	assessRisk,
	computeEventFactor,
	scoreToLevel,
	seasonalFactor,
	eventRiskScore,
	RISK_DISCLAIMER,
	RISK_LEVEL_BANDS
} from '$lib/server/risk/engine.ts';

/** Builds a valid event with sensible defaults so tests stay readable. */
function makeEvent(overrides: Partial<DisasterEvent> = {}): DisasterEvent {
	return {
		id: overrides.id ?? `test-${Math.random().toString(36).slice(2)}`,
		type: overrides.type ?? 'flood',
		category: overrides.category ?? 'current_event',
		title: overrides.title ?? 'Test event',
		severity: overrides.severity ?? 'moderate',
		location: overrides.location ?? { latitude: -6.2, longitude: 106.8 },
		updatedAt: overrides.updatedAt ?? new Date().toISOString(),
		source: overrides.source ?? { name: 'BMKG' },
		...overrides
	};
}

describe('score banding', () => {
	it('maps scores to the documented bands', () => {
		expect(scoreToLevel(0)).toBe('low');
		expect(scoreToLevel(25)).toBe('low');
		expect(scoreToLevel(26)).toBe('moderate');
		expect(scoreToLevel(50)).toBe('moderate');
		expect(scoreToLevel(51)).toBe('high');
		expect(scoreToLevel(75)).toBe('high');
		expect(scoreToLevel(76)).toBe('very_high');
		expect(scoreToLevel(100)).toBe('very_high');
	});

	it('bands are contiguous and cover 0..100 with no gaps', () => {
		const bands = Object.values(RISK_LEVEL_BANDS);
		const sorted = [...bands].sort((a, b) => a.min - b.min);
		expect(sorted[0].min).toBe(0);
		expect(sorted[sorted.length - 1].max).toBe(100);
		for (let i = 0; i < sorted.length - 1; i++) {
			expect(sorted[i].max + 1).toBe(sorted[i + 1].min);
		}
	});
});

describe('seasonal factor', () => {
	it('peaks during the rainy season', () => {
		expect(seasonalFactor(1).value).toBeGreaterThan(0.8);
		expect(seasonalFactor(12).value).toBeGreaterThan(0.8);
	});

	it('is lowest during transition into the dry season', () => {
		expect(seasonalFactor(5).value).toBeLessThan(seasonalFactor(1).value);
	});

	it('always returns a human-readable reason', () => {
		for (let month = 1; month <= 12; month++) {
			const result = seasonalFactor(month);
			expect(result.reason.length).toBeGreaterThan(5);
			expect(result.value).toBeGreaterThanOrEqual(0);
			expect(result.value).toBeLessThanOrEqual(1);
		}
	});
});

describe('event factor computation', () => {
	it('returns zero for no events', () => {
		expect(computeEventFactor([])).toBe(0);
	});

	it('gives a higher value for more severe events', () => {
		const low = computeEventFactor([makeEvent({ severity: 'low' })]);
		const critical = computeEventFactor([makeEvent({ severity: 'critical' })]);
		expect(critical).toBeGreaterThan(low);
	});

	it('gives a higher value for more concurrent events', () => {
		const one = computeEventFactor([makeEvent({ severity: 'moderate' })]);
		const many = computeEventFactor(
			Array.from({ length: 6 }, (_, i) => makeEvent({ id: `e${i}`, severity: 'moderate' }))
		);
		expect(many).toBeGreaterThan(one);
	});

	it('never exceeds 1', () => {
		const huge = computeEventFactor(
			Array.from({ length: 100 }, (_, i) => makeEvent({ id: `e${i}`, severity: 'critical' }))
		);
		expect(huge).toBeLessThanOrEqual(1);
	});
});

describe('risk assessment', () => {
	it('always attaches the mandatory disclaimer', () => {
		const result = assessRisk({ events: [] });
		expect(result.disclaimer).toBe(RISK_DISCLAIMER);
		expect(result.disclaimer).toContain('bukan peringatan resmi');
	});

	it('produces a score within 0..100', () => {
		const result = assessRisk({
			events: Array.from({ length: 50 }, (_, i) =>
				makeEvent({ id: `e${i}`, category: 'early_warning', severity: 'critical' })
			)
		});
		expect(result.score).toBeGreaterThanOrEqual(0);
		expect(result.score).toBeLessThanOrEqual(100);
	});

	it('is deterministic — the same input always yields the same score', () => {
		const events = [
			makeEvent({ id: 'a', severity: 'high', category: 'early_warning' }),
			makeEvent({ id: 'b', severity: 'moderate', category: 'current_event' })
		];
		const a = assessRisk({ events, month: 1 });
		const b = assessRisk({ events, month: 1 });
		expect(a.score).toBe(b.score);
		expect(a.level).toBe(b.level);
	});

	it('scores an empty event set as low risk', () => {
		const result = assessRisk({ events: [], month: 8 });
		expect(result.score).toBeLessThanOrEqual(50);
	});

	it('scores active critical warnings much higher than quiet conditions', () => {
		const quiet = assessRisk({ events: [], month: 5 });
		const dangerous = assessRisk({
			events: [
				makeEvent({ category: 'early_warning', severity: 'critical' }),
				makeEvent({ category: 'early_warning', severity: 'critical' }),
				makeEvent({ category: 'current_event', severity: 'high' }),
				makeEvent({ type: 'volcano', category: 'hazard', severity: 'high' })
			],
			month: 1
		});
		expect(dangerous.score).toBeGreaterThan(quiet.score + 20);
	});

	it('exposes every factor with a reason and a weight', () => {
		const result = assessRisk({ events: [makeEvent()], month: 1 });
		expect(result.factors.length).toBeGreaterThan(0);
		for (const factor of result.factors) {
			expect(factor.reason.length).toBeGreaterThan(0);
			expect(factor.weight).toBeGreaterThan(0);
			expect(factor.value).toBeGreaterThanOrEqual(0);
			expect(factor.value).toBeLessThanOrEqual(1);
		}
	});

	it('includes the hazard factor only when hazard data is supplied', () => {
		const without = assessRisk({ events: [], month: 5 });
		expect(without.factors.some((f) => f.key === 'hazardExposure')).toBe(false);

		const withHazard = assessRisk({ events: [], month: 5, hazardExposure: 0.9 });
		expect(withHazard.factors.some((f) => f.key === 'hazardExposure')).toBe(true);
	});

	it('renormalizes weights so a missing factor does not depress the score', () => {
		// With no hazard data, remaining factors should still reach the full range.
		const result = assessRisk({
			events: [makeEvent({ category: 'early_warning', severity: 'critical' })],
			month: 1
		});
		expect(result.score).toBeGreaterThan(40);
	});

	it('includes a generation timestamp', () => {
		const result = assessRisk({ events: [] });
		expect(Number.isFinite(new Date(result.generatedAt).getTime())).toBe(true);
	});
});

describe('event ranking score', () => {
	it('ranks critical warnings above low historical records', () => {
		const warning = makeEvent({ category: 'early_warning', severity: 'critical' });
		const historical = makeEvent({ category: 'historical', severity: 'low' });
		expect(eventRiskScore(warning)).toBeGreaterThan(eventRiskScore(historical));
	});

	it('decays with age', () => {
		const fresh = makeEvent({
			category: 'current_event',
			severity: 'high',
			occurredAt: new Date().toISOString()
		});
		const old = makeEvent({
			category: 'current_event',
			severity: 'high',
			occurredAt: new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
		});
		expect(eventRiskScore(fresh)).toBeGreaterThan(eventRiskScore(old));
	});

	it('stays within a sane range', () => {
		for (const severity of ['critical', 'high', 'moderate', 'low', 'unknown'] as const) {
			const score = eventRiskScore(makeEvent({ severity }));
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(100);
		}
	});
});
