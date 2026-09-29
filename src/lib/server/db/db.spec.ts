import { describe, expect, it } from 'vitest';
import { getDatabase, isDatabaseEnabled, safely } from '$lib/server/db/client';
import {
	persistEvents,
	readRecentEvents,
	readEventById,
	pruneOldEvents,
	findEventsNearby,
	countEvents
} from '$lib/server/db/repository';
import type { DisasterEvent } from '$lib/types';

/**
 * The persistence layer is OPTIONAL by design.
 *
 * These tests run without `DATABASE_URL`, which is the default and the state
 * every CI run and fresh checkout is in. They lock in the contract that matters
 * most: when persistence is unavailable the app must behave as if the database
 * layer does not exist — no throws, no fabricated data, honest `null`/`0`
 * sentinels that callers branch on.
 */

function makeEvent(overrides: Partial<DisasterEvent> = {}): DisasterEvent {
	return {
		id: 'bmkg:quake:test',
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

describe('database client (disabled)', () => {
	it('reports persistence as disabled when DATABASE_URL is absent', () => {
		expect(isDatabaseEnabled()).toBe(false);
	});

	it('returns a null handle rather than a fake database', () => {
		expect(getDatabase()).toBeNull();
	});
});

describe('safely()', () => {
	it('returns the fallback when persistence is disabled', async () => {
		const result = await safely(async () => 'should-not-run', 'fallback');
		expect(result).toBe('fallback');
	});

	it('never throws, even for a rejectng operation', async () => {
		const result = await safely(async () => {
			throw new Error('boom');
		}, 42);
		expect(result).toBe(42);
	});
});

describe('repository (disabled)', () => {
	it('persistEvents is a no-op returning 0', async () => {
		await expect(persistEvents([makeEvent()])).resolves.toBe(0);
	});

	it('persistEvents with an empty batch returns 0 without touching the DB', async () => {
		await expect(persistEvents([])).resolves.toBe(0);
	});

	it('readRecentEvents returns null so callers fall back to memory, not zero', async () => {
		await expect(readRecentEvents(86_400_000)).resolves.toBeNull();
	});

	it('readEventById returns null when unavailable', async () => {
		await expect(readEventById('bmkg:quake:test')).resolves.toBeNull();
	});

	it('pruneOldEvents is a no-op returning 0', async () => {
		await expect(pruneOldEvents(90)).resolves.toBe(0);
	});

	it('findEventsNearby returns null so callers fall back to in-memory filtering', async () => {
		await expect(findEventsNearby(-6.2, 106.8, 100)).resolves.toBeNull();
	});

	it('countEvents returns null when unavailable (not a misleading 0)', async () => {
		await expect(countEvents()).resolves.toBeNull();
	});
});
