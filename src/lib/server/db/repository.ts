import { and, asc, desc, inArray, sql } from 'drizzle-orm';
import type { DisasterEvent } from '$lib/types';
import { getDatabase, safely } from '$lib/server/db/client';
import { disasterEvents, type DisasterEventInsert } from '$lib/server/db/schema';
import { logger } from '$lib/server/logger';

/**
 * Persistence repository for disaster events.
 *
 * Every function is a no-op (returning a benign value) when no database is
 * configured, so callers never branch on availability except where it changes
 * behaviour they present to the user.
 */

/**
 * SQL expression for "when the event happened".
 *
 * Events have different time semantics: an earthquake has `occurred_at`, a
 * forecast or warning has `valid_from`, and a record we only just received has
 * neither. Falling back in that order gives every row a usable timestamp
 * without inventing one. Shared by every time-based query so the definition can
 * never drift between them.
 */
const EVENT_TIME_EXPR = sql`coalesce(${disasterEvents.occurredAt}, ${disasterEvents.validFrom}, ${disasterEvents.updatedAt})`;

/** Converts a normalized event into its row representation. */
function toRow(event: DisasterEvent): DisasterEventInsert {
	const occurred = event.occurredAt ?? event.validFrom;
	return {
		id: event.id,
		type: event.type,
		category: event.category,
		severity: event.severity,
		title: event.title,
		occurredAt: occurred ? new Date(occurred) : null,
		validFrom: event.validFrom ? new Date(event.validFrom) : null,
		validUntil: event.validUntil ? new Date(event.validUntil) : null,
		latitude: Number.isFinite(event.location.latitude) ? event.location.latitude : null,
		longitude: Number.isFinite(event.location.longitude) ? event.location.longitude : null,
		province: event.location.province ?? null,
		regency: event.location.regency ?? null,
		sourceName: event.source.name,
		sourceId: event.source.sourceId ?? null,
		sourcePriority: event.source.priority ?? null,
		payload: event,
		updatedAt: new Date(event.updatedAt)
	};
}

/**
 * Upserts a batch of events.
 *
 * Conflict target is `id`, so re-syncing the same event updates it in place
 * (and preserves `first_seen_at`). This is the only write path used by the app.
 *
 * Returns the number of rows submitted (not necessarily changed), or 0 when
 * persistence is disabled / the write failed.
 */
export async function persistEvents(events: DisasterEvent[]): Promise<number> {
	if (events.length === 0) return 0;

	return safely(async () => {
		const database = getDatabase();
		if (!database) return 0;

		const rows = events.map(toRow);

		// Chunk to stay well under parameter limits for large batches.
		const CHUNK = 200;
		let written = 0;
		for (let i = 0; i < rows.length; i += CHUNK) {
			const chunk = rows.slice(i, i + CHUNK);
			await database
				.insert(disasterEvents)
				.values(chunk)
				.onConflictDoUpdate({
					target: disasterEvents.id,
					set: {
						type: sql`excluded.type`,
						category: sql`excluded.category`,
						severity: sql`excluded.severity`,
						title: sql`excluded.title`,
						occurredAt: sql`excluded.occurred_at`,
						validFrom: sql`excluded.valid_from`,
						validUntil: sql`excluded.valid_until`,
						latitude: sql`excluded.latitude`,
						longitude: sql`excluded.longitude`,
						province: sql`excluded.province`,
						regency: sql`excluded.regency`,
						sourceName: sql`excluded.source_name`,
						sourceId: sql`excluded.source_id`,
						sourcePriority: sql`excluded.source_priority`,
						payload: sql`excluded.payload`,
						updatedAt: sql`excluded.updated_at`
					}
				});
			written += chunk.length;
		}

		logger.debug('persisted events', { scope: 'db', count: written });
		return written;
	}, 0);
}

/**
 * Reads persisted events that occurred within the last `sinceMs`.
 * Returns `null` when persistence is unavailable, so the caller can fall back to
 * the in-memory store rather than silently reporting zero events.
 */
export async function readRecentEvents(
	sinceMs: number,
	limit = 5000
): Promise<DisasterEvent[] | null> {
	const database = getDatabase();
	if (!database) return null;

	// Pass an ISO string (explicitly cast) rather than a JS Date: the Drizzle
	// `sql` placeholder wrapper does not survive the postgres-js serialiser for
	// Date values, which silently failed every read until this was fixed.
	const cutoffIso = new Date(Date.now() - sinceMs).toISOString();

	return safely(async () => {
		const rows = await database
			.select({ payload: disasterEvents.payload })
			.from(disasterEvents)
			.where(sql`${EVENT_TIME_EXPR} >= ${cutoffIso}::timestamptz`)
			.orderBy(desc(EVENT_TIME_EXPR))
			.limit(limit);

		return rows.map((row) => row.payload);
	}, null);
}

/** Fetches a single persisted event by id, or `null` when absent/disabled. */
export async function readEventById(id: string): Promise<DisasterEvent | null> {
	const database = getDatabase();
	if (!database) return null;

	return safely(async () => {
		const rows = await database
			.select({ payload: disasterEvents.payload })
			.from(disasterEvents)
			.where(sql`${disasterEvents.id} = ${id}`)
			.limit(1);
		return rows[0]?.payload ?? null;
	}, null);
}

export interface PersistedCounts {
	total: number;
	byType: Array<{ key: string; count: number }>;
	bySeverity: Array<{ key: string; count: number }>;
	byCategory: Array<{ key: string; count: number }>;
	bySource: Array<{ key: string; count: number }>;
	byDay: Array<{ day: string; count: number }>;
	earliest: string | null;
	latest: string | null;
}

/**
 * Aggregates persisted counts in SQL.
 *
 * This is the main reason to run with a database: statistics over a long window
 * without holding every event in memory. Returns `null` when disabled.
 */
export async function readPersistedCounts(
	sinceMs: number,
	options: { types?: string[]; provinces?: string[] } = {}
): Promise<PersistedCounts | null> {
	const database = getDatabase();
	if (!database) return null;

	const cutoffIso = new Date(Date.now() - sinceMs).toISOString();

	const conditions = [sql`${EVENT_TIME_EXPR} >= ${cutoffIso}::timestamptz`];
	if (options.types?.length) {
		conditions.push(inArray(disasterEvents.type, options.types));
	}
	if (options.provinces?.length) {
		conditions.push(inArray(disasterEvents.province, options.provinces));
	}
	const where = and(...conditions);

	return safely(async () => {
		const timeExpr = EVENT_TIME_EXPR;

		const [totalRow] = await database
			.select({ count: sql<number>`count(*)::int` })
			.from(disasterEvents)
			.where(where);

		const group = async (
			column:
				| typeof disasterEvents.type
				| typeof disasterEvents.severity
				| typeof disasterEvents.category
				| typeof disasterEvents.sourceName
		) => {
			const rows = await database
				.select({ key: column, count: sql<number>`count(*)::int` })
				.from(disasterEvents)
				.where(where)
				.groupBy(column)
				.orderBy(desc(sql`count(*)`));
			return rows.map((r) => ({ key: r.key ?? 'unknown', count: Number(r.count) }));
		};

		const byType = await group(disasterEvents.type);
		const bySeverity = await group(disasterEvents.severity);
		const byCategory = await group(disasterEvents.category);
		const bySource = await group(disasterEvents.sourceName);

		const dayRows = await database
			.select({
				day: sql<string>`to_char(date_trunc('day', ${timeExpr}) at time zone 'UTC', 'YYYY-MM-DD')`,
				count: sql<number>`count(*)::int`
			})
			.from(disasterEvents)
			.where(where)
			.groupBy(sql`date_trunc('day', ${timeExpr})`)
			.orderBy(asc(sql`date_trunc('day', ${timeExpr})`));

		const [rangeRow] = await database
			.select({
				earliest: sql<string | null>`min(${timeExpr})::text`,
				latest: sql<string | null>`max(${timeExpr})::text`
			})
			.from(disasterEvents)
			.where(where);

		return {
			total: Number(totalRow?.count ?? 0),
			byType,
			bySeverity,
			byCategory,
			bySource,
			byDay: dayRows.map((r) => ({ day: r.day, count: Number(r.count) })),
			earliest: rangeRow?.earliest ? new Date(rangeRow.earliest).toISOString() : null,
			latest: rangeRow?.latest ? new Date(rangeRow.latest).toISOString() : null
		};
	}, null);
}

/**
 * Deletes events older than the retention window.
 * Called opportunistically after a sync; safe to run repeatedly.
 */
export async function pruneOldEvents(retentionDays: number): Promise<number> {
	const database = getDatabase();
	if (!database) return 0;

	return safely(async () => {
		const cutoffIso = new Date(Date.now() - retentionDays * 24 * 3600_000).toISOString();
		const deleted = await database
			.delete(disasterEvents)
			.where(sql`${disasterEvents.updatedAt} < ${cutoffIso}::timestamptz`)
			.returning({ id: disasterEvents.id });
		logger.info('pruned old events', { scope: 'db', deleted: deleted.length });
		return deleted.length;
	}, 0);
}
