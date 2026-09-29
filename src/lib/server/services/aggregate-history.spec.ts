import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DisasterEvent } from '$lib/types';

/**
 * withHistory: merges durable history into a live event list.
 *
 * The critical contract is that the stateless build is unaffected — when no
 * database is configured the live list is returned untouched, with
 * `fromHistory: false`.
 */

const readRecentEvents = vi.fn();

vi.mock('$lib/server/db/repository', () => ({
	readRecentEvents: (...args: unknown[]) => readRecentEvents(...args),
	persistEvents: vi.fn(async () => 0)
}));

function makeEvent(overrides: Partial<DisasterEvent> = {}): DisasterEvent {
	return {
		id: 'bmkg:quake:live',
		type: 'earthquake',
		category: 'current_event',
		title: 'Gempa M4.5',
		severity: 'moderate',
		location: { latitude: -6.2, longitude: 106.8 },
		occurredAt: new Date().toISOString(),
		source: { name: 'BMKG' },
		updatedAt: new Date().toISOString(),
		...overrides
	};
}

beforeEach(() => {
	readRecentEvents.mockReset();
});

async function load() {
	return import('$lib/server/services/aggregate');
}

describe('withHistory', () => {
	it('returns live events unchanged when persistence is unavailable', async () => {
		readRecentEvents.mockResolvedValue(null);
		const { withHistory } = await load();

		const live = [makeEvent({ id: 'a' })];
		const result = await withHistory(live);

		expect(result.fromHistory).toBe(false);
		expect(result.events).toBe(live);
	});

	it('merges unique persisted events into the live list', async () => {
		readRecentEvents.mockResolvedValue([makeEvent({ id: 'historical-1' })]);
		const { withHistory } = await load();

		const result = await withHistory([makeEvent({ id: 'live-1' })]);

		expect(result.fromHistory).toBe(true);
		expect(result.events.map((e) => e.id).sort()).toEqual(['historical-1', 'live-1']);
	});

	it('lets the live copy win over a stale persisted duplicate', async () => {
		readRecentEvents.mockResolvedValue([makeEvent({ id: 'dup', title: 'Stale', severity: 'low' })]);
		const { withHistory } = await load();

		const result = await withHistory([makeEvent({ id: 'dup', title: 'Live', severity: 'high' })]);

		expect(result.events).toHaveLength(1);
		const merged = result.events.find((e) => e.id === 'dup');
		expect(merged?.title).toBe('Live');
		expect(merged?.severity).toBe('high');
	});

	it('reports fromHistory:false when the history read returns an empty array', async () => {
		readRecentEvents.mockResolvedValue([]);
		const { withHistory } = await load();

		const result = await withHistory([makeEvent({ id: 'only-live' })]);
		expect(result.fromHistory).toBe(false);
		expect(result.events).toHaveLength(1);
	});
});
