import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DisasterEvent } from '$lib/types';

/**
 * Statistics composition.
 *
 * These tests exercise the merge between live (aggregated) events and any
 * durably-persisted history, without touching the network or a database:
 * `aggregateEvents` and `readRecentEvents` are stubbed so the assertions are
 * about OUR logic (merge, de-duplicate, window filter, honest provenance
 * flags), not about upstream providers.
 *
 * The most important guarantee under test: with no database configured the
 * result must be computed from live events alone and must NOT claim a persisted
 * history it does not have.
 */

const aggregateEvents = vi.fn();
const readRecentEvents = vi.fn();

vi.mock('$lib/server/services/aggregate', () => ({
	aggregateEvents: (...args: unknown[]) => aggregateEvents(...args),
	getVolcanoes: vi.fn(async () => ({
		provider: 'pvmbg-volcano',
		events: [],
		retrievedAt: new Date().toISOString(),
		cached: false,
		stale: false,
		degraded: false,
		partial: false,
		warnings: []
	}))
}));

vi.mock('$lib/server/db/repository', () => ({
	readRecentEvents: (...args: unknown[]) => readRecentEvents(...args),
	persistEvents: vi.fn(async () => 0)
}));

function makeEvent(overrides: Partial<DisasterEvent> = {}): DisasterEvent {
	return {
		id: 'bmkg:quake:1',
		type: 'earthquake',
		category: 'current_event',
		title: 'Gempa M4.5',
		severity: 'moderate',
		location: { latitude: -6.2, longitude: 106.8, province: 'DKI Jakarta' },
		occurredAt: new Date().toISOString(),
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

beforeEach(() => {
	aggregateEvents.mockReset();
	readRecentEvents.mockReset();
});

describe('getStatistics', () => {
	it('reports persisted:false and uses live events when no database is configured', async () => {
		aggregateEvents.mockResolvedValue(aggregate([makeEvent(), makeEvent({ id: 'bmkg:quake:2' })]));
		readRecentEvents.mockResolvedValue(null);

		const { getStatistics } = await import('$lib/server/services/dashboard');
		const stats = await getStatistics(7 * 86_400_000, '7d');

		expect(stats.persisted).toBe(false);
		expect(stats.persistedCount).toBe(0);
		expect(stats.total).toBe(2);
		expect(stats.window).toBe('7d');
	});

	it('merges persisted history and reports its provenance when available', async () => {
		const live = makeEvent({ id: 'bmkg:quake:live' });
		const historical = makeEvent({
			id: 'bmkg:quake:historical',
			occurredAt: new Date(Date.now() - 2 * 86_400_000).toISOString()
		});
		aggregateEvents.mockResolvedValue(aggregate([live]));
		readRecentEvents.mockResolvedValue([historical]);

		const { getStatistics } = await import('$lib/server/services/dashboard');
		const stats = await getStatistics(7 * 86_400_000, '7d');

		expect(stats.persisted).toBe(true);
		expect(stats.persistedCount).toBe(1);
		expect(stats.total).toBe(2);
	});

	it('lets live events win over a stale persisted copy of the same id', async () => {
		const id = 'bmkg:quake:same';
		aggregateEvents.mockResolvedValue(
			aggregate([makeEvent({ id, severity: 'high', title: 'Live copy' })])
		);
		readRecentEvents.mockResolvedValue([makeEvent({ id, severity: 'low', title: 'Stale copy' })]);

		const { getStatistics } = await import('$lib/server/services/dashboard');
		const stats = await getStatistics(7 * 86_400_000, '7d');

		// Merged by id: one row, and it reflects the live severity.
		expect(stats.total).toBe(1);
		const high = stats.bySeverity.find((b) => b.key === 'high');
		expect(high?.count).toBe(1);
	});

	it('excludes events outside the requested window', async () => {
		const old = makeEvent({
			id: 'bmkg:quake:old',
			occurredAt: new Date(Date.now() - 30 * 86_400_000).toISOString()
		});
		aggregateEvents.mockResolvedValue(aggregate([old]));
		readRecentEvents.mockResolvedValue(null);

		const { getStatistics } = await import('$lib/server/services/dashboard');
		const stats = await getStatistics(7 * 86_400_000, '7d');

		expect(stats.total).toBe(0);
	});
});
