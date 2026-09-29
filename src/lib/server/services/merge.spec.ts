import { describe, expect, it } from 'vitest';
import type { DisasterEvent, DataCategory, Severity } from '$lib/types';
import {
	mergeEvents,
	eventDedupeKey,
	compareEvents,
	eventTimestamp,
	eventStore
} from '$lib/server/services/merge';
import type { NormalizedProviderPayload } from '$lib/server/services/types';

function makeEvent(overrides: Partial<DisasterEvent> = {}): DisasterEvent {
	return {
		id: overrides.id ?? 'id-1',
		type: overrides.type ?? 'earthquake',
		category: (overrides.category ?? 'current_event') as DataCategory,
		title: overrides.title ?? 'Event',
		severity: (overrides.severity ?? 'moderate') as Severity,
		location: overrides.location ?? { latitude: -6.2, longitude: 106.8 },
		updatedAt: overrides.updatedAt ?? '2026-09-29T10:00:00.000Z',
		source: overrides.source ?? { name: 'BMKG', priority: 100 },
		...overrides
	};
}

function makePayload(
	provider: string,
	events: DisasterEvent[],
	priority = 100
): NormalizedProviderPayload {
	return {
		provider,
		events,
		priority,
		retrievedAt: '2026-09-29T10:00:00.000Z',
		cached: false,
		stale: false
	};
}

describe('dedupe keys', () => {
	it('prefers source identity over the internal id', () => {
		const event = makeEvent({
			id: 'internal-1',
			source: { name: 'BMKG', sourceId: 'bmkg-guid-9' }
		});
		expect(eventDedupeKey(event)).toBe('BMKG::bmkg-guid-9');
	});

	it('falls back to the internal id when no source id exists', () => {
		const event = makeEvent({ id: 'internal-2', source: { name: 'BMKG' } });
		expect(eventDedupeKey(event)).toBe('internal-2');
	});
});

describe('event merging', () => {
	it('keeps a single copy of an identical record from one source', () => {
		const event = makeEvent({ id: 'bmkg:quake:1' });
		const merged = mergeEvents([makePayload('a', [event]), makePayload('b', [event])]);
		expect(merged).toHaveLength(1);
	});

	it('keeps genuinely different events', () => {
		const a = makeEvent({ id: 'bmkg:quake:1', location: { latitude: -6, longitude: 106 } });
		const b = makeEvent({ id: 'bmkg:quake:2', location: { latitude: 1, longitude: 120 } });
		expect(mergeEvents([makePayload('a', [a, b])])).toHaveLength(2);
	});

	it('prefers the higher-priority source for the same event', () => {
		const lowPriority = makeEvent({
			id: 'same-event',
			source: { name: 'Secondary', priority: 10 },
			title: 'Lower authority title'
		});
		const highPriority = makeEvent({
			id: 'same-event',
			source: { name: 'BMKG', priority: 100 },
			title: 'Authoritative title'
		});

		const merged = mergeEvents([
			makePayload('secondary', [lowPriority], 10),
			makePayload('bmkg', [highPriority], 100)
		]);

		expect(merged).toHaveLength(1);
		expect(merged[0].source.name).toBe('BMKG');
		expect(merged[0].title).toBe('Authoritative title');
	});

	it('retains provenance for every contributing source', () => {
		const event = makeEvent({ id: 'shared', source: { name: 'BMKG', priority: 100 } });
		const other = makeEvent({ id: 'shared', source: { name: 'BPBD', priority: 50 } });

		const merged = mergeEvents([makePayload('a', [event], 100), makePayload('b', [other], 50)]);

		const provenance = merged[0].metadata?.provenance as Array<{ source: string }> | undefined;
		expect(provenance).toBeDefined();
		expect(provenance!.map((p) => p.source).sort()).toEqual(['BMKG', 'BPBD']);
	});

	it('never returns two events with the same id, even from different source ids', () => {
		// Reproduces the BMKG cross-feed case: the same physical quake published
		// with different guids (or a guid in one feed and a hash in another) has
		// two distinct source ids but the SAME internal id after normalization.
		const fromListFeed = makeEvent({
			id: 'bmkg:quake:abc',
			source: { name: 'BMKG', sourceId: 'guid-a', priority: 100 }
		});
		const fromLatestFeed = makeEvent({
			id: 'bmkg:quake:abc',
			source: { name: 'BMKG', sourceId: 'guid-b', priority: 100 }
		});

		const merged = mergeEvents([
			makePayload('a', [fromListFeed]),
			makePayload('b', [fromLatestFeed])
		]);

		const ids = merged.map((event) => event.id);
		expect(new Set(ids).size).toBe(ids.length);

		// The first keeps the original id; the second is disambiguated but still
		// derived from it, so ids stay stable and human-traceable.
		expect(ids[0]).toBe('bmkg:quake:abc');
		expect(ids[1]).toMatch(/^bmkg:quake:abc#\d+$/);
	});

	it('produces stable ids for the same input ordering', () => {
		const a = makeEvent({ id: 'dup', source: { name: 'BMKG', sourceId: 'a' } });
		const b = makeEvent({ id: 'dup', source: { name: 'BMKG', sourceId: 'b' } });
		const first = mergeEvents([makePayload('a', [a]), makePayload('b', [b])]).map((e) => e.id);
		const second = mergeEvents([makePayload('a', [a]), makePayload('b', [b])]).map((e) => e.id);
		expect(first).toEqual(second);
	});
});

describe('event ordering', () => {
	it('ranks official warnings above forecasts regardless of severity', () => {
		const warning = makeEvent({ id: 'w', category: 'early_warning', severity: 'moderate' });
		const forecast = makeEvent({ id: 'f', category: 'forecast', severity: 'critical' });
		expect(compareEvents(warning, forecast)).toBeLessThan(0);
	});

	it('ranks by severity within the same category', () => {
		const high = makeEvent({ id: 'h', severity: 'high', category: 'current_event' });
		const low = makeEvent({ id: 'l', severity: 'low', category: 'current_event' });
		expect(compareEvents(high, low)).toBeLessThan(0);
	});

	it('ranks by recency when category and severity match', () => {
		const newer = makeEvent({ id: 'n', occurredAt: '2026-09-29T10:00:00.000Z' });
		const older = makeEvent({ id: 'o', occurredAt: '2026-09-28T10:00:00.000Z' });
		expect(compareEvents(newer, older)).toBeLessThan(0);
	});

	it('produces a stable, fully ordered list', () => {
		const events = [
			makeEvent({ id: '1', category: 'historical', severity: 'low' }),
			makeEvent({ id: '2', category: 'early_warning', severity: 'critical' }),
			makeEvent({ id: '3', category: 'current_event', severity: 'high' }),
			makeEvent({ id: '4', category: 'early_warning', severity: 'moderate' })
		];
		const merged = mergeEvents([makePayload('x', events)]);
		expect(merged.map((e) => e.id)).toEqual(['2', '4', '3', '1']);
	});
});

describe('event timestamps', () => {
	it('prefers occurredAt', () => {
		const event = makeEvent({
			occurredAt: '2026-09-29T10:00:00.000Z',
			validFrom: '2026-09-29T09:00:00.000Z'
		});
		expect(eventTimestamp(event)).toBe(new Date('2026-09-29T10:00:00.000Z').getTime());
	});

	it('falls back to validFrom then updatedAt', () => {
		const event = makeEvent({ validFrom: '2026-09-29T09:00:00.000Z' });
		expect(eventTimestamp(event)).toBe(new Date('2026-09-29T09:00:00.000Z').getTime());
	});

	it('returns 0 for unusable timestamps instead of NaN', () => {
		const event = makeEvent({ occurredAt: undefined, validFrom: undefined, updatedAt: 'nonsense' });
		expect(eventTimestamp(event)).toBe(0);
	});
});

describe('event store', () => {
	it('stores and retrieves events by id', () => {
		eventStore.clear();
		const event = makeEvent({ id: 'store-test-1' });
		eventStore.put([event]);
		expect(eventStore.get('store-test-1')?.id).toBe('store-test-1');
	});

	it('returns null for unknown ids rather than throwing', () => {
		eventStore.clear();
		expect(eventStore.get('does-not-exist')).toBeNull();
	});

	it('filters by recency window', () => {
		eventStore.clear();
		const fresh = makeEvent({ id: 'fresh', occurredAt: new Date().toISOString() });
		const old = makeEvent({
			id: 'old',
			occurredAt: new Date(Date.now() - 40 * 24 * 3600_000).toISOString()
		});
		eventStore.put([fresh, old]);

		const recent = eventStore.since(7 * 24 * 3600_000);
		expect(recent.map((e) => e.id)).toContain('fresh');
		expect(recent.map((e) => e.id)).not.toContain('old');
	});
});
