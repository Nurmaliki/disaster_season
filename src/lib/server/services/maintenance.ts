import { config } from '$lib/server/config';
import { logger } from '$lib/server/logger';
import { countEvents, pruneOldEvents } from '$lib/server/db/repository';
import { isDatabaseEnabled } from '$lib/server/db/client';

/**
 * Data retention maintenance.
 *
 * The database is append-mostly (every sync upserts current events), so without
 * a retention pass it grows without bound. This module runs the prune and
 * reports what it did, honestly distinguishing "nothing to do" from "could not
 * run".
 *
 * It is intentionally NOT invoked from request handlers: deletion should be an
 * explicit, scheduled action, not a side effect of someone loading a page.
 */

export interface RetentionReport {
	/** Whether durable storage is configured at all. */
	enabled: boolean;
	/** Rows before the prune (null when unavailable). */
	before: number | null;
	/** Rows deleted by this run. */
	deleted: number;
	/** Rows after the prune (null when unavailable). */
	after: number | null;
	/** Retention window applied, in days. */
	retentionDays: number;
	/** ISO timestamp of this run. */
	ranAt: string;
}

/**
 * Runs the retention prune.
 *
 * Never throws and never fails the caller: when persistence is disabled it
 * returns a report with `enabled: false` and does nothing, which is the honest
 * outcome rather than a pretend success. It is also wrapped defensively because
 * it is a cron entry point — an exception here should never surface as a failed
 * scheduled job that someone has to debug.
 */
export async function runRetention(): Promise<RetentionReport> {
	const ranAt = new Date().toISOString();
	const retentionDays = config.database.retentionDays;
	const empty: RetentionReport = {
		enabled: false,
		before: null,
		deleted: 0,
		after: null,
		retentionDays,
		ranAt
	};

	try {
		if (!isDatabaseEnabled()) return empty;

		const before = await countEvents();
		const deleted = await pruneOldEvents(retentionDays);
		const after = await countEvents();

		logger.info('retention run complete', {
			scope: 'maintenance',
			before,
			deleted,
			after,
			retentionDays
		});

		return { enabled: true, before, deleted, after, retentionDays, ranAt };
	} catch (error) {
		logger.error('retention run failed', { scope: 'maintenance', error });
		return { ...empty, enabled: isDatabaseEnabled() };
	}
}
