import {
	index,
	integer,
	jsonb,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import type { DisasterEvent } from '$lib/types';

/**
 * Persisted disaster events.
 *
 * Design notes:
 *
 * - The canonical `DisasterEvent` is stored as JSONB in `payload` so the shape
 *   can evolve without a migration for every metadata field a provider adds.
 * - The columns that are actually *queried* (type, category, severity, time,
 *   location, source) are lifted into their own indexed columns. This keeps
 *   statistical queries fast without normalising the variable part of the model.
 * - `id` is the app's stable event id (e.g. `bmkg:quake:<hash>`), so an upsert
 *   on `id` is idempotent across repeated syncs.
 * - `first_seen_at` is preserved across upserts; `updated_at` reflects the
 *   latest sync. This lets us tell "new event" from "re-observed event".
 */
export const disasterEvents = pgTable(
	'disaster_events',
	{
		id: text('id').primaryKey(),

		type: text('type').notNull(),
		category: text('category').notNull(),
		severity: text('severity').notNull(),

		title: text('title').notNull(),

		/** Occurrence time where known (earthquakes, events); else validity start. */
		occurredAt: timestamp('occurred_at', { withTimezone: true }),
		validFrom: timestamp('valid_from', { withTimezone: true }),
		validUntil: timestamp('valid_until', { withTimezone: true }),

		latitude: real('latitude'),
		longitude: real('longitude'),
		province: text('province'),
		regency: text('regency'),

		sourceName: text('source_name').notNull(),
		sourceId: text('source_id'),
		sourcePriority: integer('source_priority'),

		/** Full normalized event. */
		payload: jsonb('payload').$type<DisasterEvent>().notNull(),

		firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('disaster_events_occurred_at_idx').on(table.occurredAt),
		index('disaster_events_type_idx').on(table.type),
		index('disaster_events_category_idx').on(table.category),
		index('disaster_events_severity_idx').on(table.severity),
		index('disaster_events_province_idx').on(table.province),
		index('disaster_events_source_name_idx').on(table.sourceName),
		index('disaster_events_updated_at_idx').on(table.updatedAt),
		uniqueIndex('disaster_events_source_identity_idx').on(table.sourceName, table.sourceId)
	]
);

export type DisasterEventRow = typeof disasterEvents.$inferSelect;
export type DisasterEventInsert = typeof disasterEvents.$inferInsert;
