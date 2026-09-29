import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DisasterEvent } from '$lib/types';

/**
 * Aggregate wiring for the wildfire (NASA FIRMS) provider.
 *
 * The provider is opt-in and can be dormant. These tests pin the two behaviours
 * that protect data honesty and application stability:
 *   1. A dormant FIRMS source still appears in `sources` (so /status and the UI
 *      can show it as `unconfigured`) and never fails the whole aggregate.
 *   2. A failing FIRMS source degrades the aggregate instead of breaking it.
 */

const earthquakeEvents: DisasterEvent[] = [];
const warningEvents: DisasterEvent[] = [];
let hotspotPayload: Record<string, unknown>;
let hotspotShouldThrow = false;

vi.mock('$lib/server/services/health', () => ({
	recordSuccess: vi.fn(),
	recordFailure: vi.fn()
}));

vi.mock('$lib/server/services/merge', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/services/merge')>(
		'$lib/server/services/merge'
	);
	return actual;
});

vi.mock('$lib/server/db/repository', () => ({
	persistEvents: vi.fn(async () => 0),
	readRecentEvents: vi.fn(async () => null)
}));

vi.mock('$lib/server/providers/bmkg/earthquake', () => ({
	fetchEarthquakeFeed: vi.fn(async () => ({ earthquakes: [], durationMs: 1, feed: 'autogempa' }))
}));

vi.mock('$lib/server/providers/bmkg/earthquake-normalizer', () => ({
	normalizeEarthquakes: vi.fn(() => earthquakeEvents)
}));

vi.mock('$lib/server/providers/bmkg/warning', () => ({
	fetchCapRss: vi.fn(async () => ({ items: [], durationMs: 1 })),
	fetchCapAlerts: vi.fn(async () => [])
}));

vi.mock('$lib/server/providers/bmkg/warning-normalizer', () => ({
	normalizeWarnings: vi.fn(() => warningEvents)
}));

vi.mock('$lib/server/providers/inarisk/layers', () => ({
	probeInarisk: vi.fn(async () => ({ reachable: false, durationMs: 1, error: 'unreachable' }))
}));

vi.mock('$lib/server/providers/bnpb/disaster', () => ({
	probeBnpb: vi.fn(async () => ({ reachable: false, durationMs: 1, error: 'unreachable' }))
}));

vi.mock('$lib/server/providers/firms/wildfire', () => ({
	firmsConfigured: vi.fn(() => Boolean(hotspotPayload?.configured)),
	fetchHotspots: vi.fn(async () => {
		if (hotspotShouldThrow) throw new Error('FIRMS unavailable');
		return { hotspots: [], status: 200, durationMs: 1, url: 'x', unconfigured: false };
	})
}));

vi.mock('$lib/server/providers/firms/wildfire-normalizer', () => ({
	normalizeHotspots: vi.fn(() => (hotspotPayload?.events as DisasterEvent[]) ?? [])
}));

const { aggregateEvents } = await import('$lib/server/services/aggregate');

beforeEach(() => {
	hotspotPayload = { configured: false, events: [] };
	hotspotShouldThrow = false;
});

describe('aggregateEvents wildfire wiring', () => {
	it('lists the FIRMS source as unconfigured when no MAP_KEY is set', async () => {
		hotspotPayload = { configured: false, events: [] };
		const result = await aggregateEvents({ includeVolcanoes: false, forceRefresh: true });

		const source = result.sources.find((s) => s.provider === 'firms-wildfire');
		expect(source).toBeDefined();
		// A dormant provider is not a failure: it reports OK with zero events.
		expect(['ok', 'degraded']).toContain(source?.status);
		expect(source?.count).toBe(0);
	});

	it('includes hotspot events when the provider is configured', async () => {
		hotspotPayload = {
			configured: true,
			events: [
				{
					id: 'firms:hotspot:abc',
					type: 'wildfire',
					category: 'observation',
					title: 'Titik Panas (Hotspot) — -2.981, 104.752',
					severity: 'moderate',
					severityIsInternal: true,
					location: { latitude: -2.981, longitude: 104.752 },
					updatedAt: new Date().toISOString(),
					source: { name: 'NASA FIRMS' }
				} satisfies DisasterEvent
			]
		};

		const result = await aggregateEvents({ includeVolcanoes: false, forceRefresh: true });
		expect(result.events.some((e) => e.type === 'wildfire')).toBe(true);
		const source = result.sources.find((s) => s.provider === 'firms-wildfire');
		expect(source?.count).toBe(1);
	});

	it('degrades gracefully when the FIRMS call fails', async () => {
		hotspotPayload = { configured: true, events: [] };
		hotspotShouldThrow = true;

		const result = await aggregateEvents({ includeVolcanoes: false, forceRefresh: true });
		const source = result.sources.find((s) => s.provider === 'firms-wildfire');
		// A failing provider must never throw out of the aggregate: it is either
		// degraded (served stale) or unavailable, and the request still resolves.
		expect(['degraded', 'unavailable']).toContain(source?.status);
		expect(result.partial).toBe(true);
	});
});
