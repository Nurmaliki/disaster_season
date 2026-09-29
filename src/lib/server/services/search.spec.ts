import { describe, expect, it, vi } from 'vitest';
import type { DisasterEvent } from '$lib/types';

/**
 * Unified search.
 *
 * These tests pin the behaviour that matters for a safety tool:
 *  - region and event matching both work (a monitor is searched by place AND event),
 *  - a provider outage yields `eventsSearched: false` rather than a fake zero,
 *  - short queries return nothing rather than everything.
 *
 * The live aggregate is stubbed so the assertions are about search logic, not
 * about upstream providers or the network.
 */

const aggregateEvents = vi.fn();

vi.mock('$lib/server/services/aggregate', () => ({
	aggregateEvents: (...args: unknown[]) => aggregateEvents(...args)
}));

function makeEvent(overrides: Partial<DisasterEvent> = {}): DisasterEvent {
	return {
		id: 'bmkg:quake:1',
		type: 'earthquake',
		category: 'current_event',
		title: 'Gempa M5.0',
		severity: 'moderate',
		location: { latitude: -6.2, longitude: 106.8 },
		source: { name: 'BMKG' },
		updatedAt: new Date().toISOString(),
		...overrides
	};
}

function aggregate(events: DisasterEvent[]) {
	return {
		events,
		sources: [],
		updatedAt: new Date().toISOString(),
		partial: false,
		warnings: []
	};
}

async function load() {
	const mod = await import('$lib/server/services/search');
	return mod;
}

describe('searchEverything', () => {
	it('returns nothing for queries shorter than 2 characters', async () => {
		aggregateEvents.mockResolvedValue(aggregate([]));
		const { searchEverything } = await load();

		const result = await searchEverything('a');
		expect(result.regions).toHaveLength(0);
		expect(result.events).toHaveLength(0);
		expect(result.eventsSearched).toBe(false);
		// Crucially, the aggregate must not even be consulted for a trivial query.
		expect(aggregateEvents).not.toHaveBeenCalled();
	});

	it('matches regions from the bundled table', async () => {
		aggregateEvents.mockResolvedValue(aggregate([]));
		const { searchEverything } = await load();

		const result = await searchEverything('bandung');
		expect(result.regions.length).toBeGreaterThan(0);
		expect(result.regions[0]?.kind).toBe('region');
		expect(result.regions[0]?.href.startsWith('/location/')).toBe(true);
	});

	it('matches events by Indonesian type keyword (e.g. "gempa")', async () => {
		aggregateEvents.mockResolvedValue(aggregate([makeEvent({ title: 'Gempa M5.0' })]));
		const { searchEverything } = await load();

		const result = await searchEverything('gempa');
		expect(result.events).toHaveLength(1);
		expect(result.events[0]?.kind).toBe('earthquake');
		expect(result.events[0]?.href).toBe('/event/bmkg%3Aquake%3A1');
	});

	it('matches events by place name in the title', async () => {
		aggregateEvents.mockResolvedValue(
			aggregate([makeEvent({ title: 'Gempa M4.2 — 20 km BaratDaya BANDUNG' })])
		);
		const { searchEverything } = await load();

		const result = await searchEverything('bandung');
		expect(result.events).toHaveLength(1);
	});

	it('reports eventsSearched:false instead of a false zero when the provider fails', async () => {
		aggregateEvents.mockRejectedValue(new Error('provider down'));
		const { searchEverything } = await load();

		const result = await searchEverything('gempa');
		expect(result.events).toHaveLength(0);
		expect(result.eventsSearched).toBe(false);
	});

	it('orders event matches by severity then recency', async () => {
		aggregateEvents.mockResolvedValue(
			aggregate([
				makeEvent({
					id: 'low',
					severity: 'low',
					title: 'Gempa kecil',
					occurredAt: '2026-01-01T00:00:00.000Z'
				}),
				makeEvent({
					id: 'high',
					severity: 'high',
					title: 'Gempa besar',
					occurredAt: '2025-01-01T00:00:00.000Z'
				})
			])
		);
		const { searchEverything } = await load();

		const result = await searchEverything('gempa');
		expect(result.events[0]?.id).toBe('high');
	});
});
