import { describe, expect, it, vi } from 'vitest';

/**
 * Retention maintenance.
 *
 * These tests run with no database configured (the default), so they pin the
 * most important contract: maintenance must be a safe no-op that reports the
 * truth (`enabled: false`) rather than pretending it did work, and it must
 * never throw.
 */

describe('runRetention (no database)', () => {
	it('reports enabled:false and deletes nothing when persistence is off', async () => {
		const { runRetention } = await import('$lib/server/services/maintenance');
		const report = await runRetention();

		expect(report.enabled).toBe(false);
		expect(report.deleted).toBe(0);
		expect(report.before).toBeNull();
		expect(report.after).toBeNull();
		expect(report.retentionDays).toBeGreaterThan(0);
		expect(typeof report.ranAt).toBe('string');
	});

	it('never throws, even if the underlying prune fails', async () => {
		vi.resetModules();
		vi.doMock('$lib/server/db/repository', () => ({
			countEvents: vi.fn(async () => 10),
			pruneOldEvents: vi.fn(async () => {
				throw new Error('boom');
			})
		}));
		vi.doMock('$lib/server/db/client', () => ({
			isDatabaseEnabled: () => true
		}));

		const { runRetention } = await import('$lib/server/services/maintenance');
		const report = await runRetention();

		// The failure is absorbed and reported honestly, not propagated.
		expect(report.enabled).toBe(true);
		expect(report.deleted).toBe(0);

		vi.doUnmock('$lib/server/db/repository');
		vi.doUnmock('$lib/server/db/client');
		vi.resetModules();
	});
});
