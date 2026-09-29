import { sql } from 'drizzle-orm';
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
 * - A `earth` expression index (see the migration) accelerates radius search
 *   via the `earthdistance` extension when it is installed. Spatial search is
 *   fully optional: without the extension the app falls back to in-memory
 *   distance filtering.
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
		// One row per (provider, upstream id): re-syncing the same record updates
		// in place rather than accumulating duplicates.
		uniqueIndex('disaster_events_source_identity_idx').on(table.sourceName, table.sourceId),
		// Spatial index for radius search. Requires the `cube` + `earthdistance`
		// extensions, which the migration enables. Created with raw SQL because
		// Drizzle has no first-class support for GiST expression indexes.
		index('disaster_events_earth_idx').using(
			'gist',
			sql`ll_to_earth(${table.latitude}, ${table.longitude})`
		)
	]
);

export type DisasterEventRow = typeof disasterEvents.$inferSelect;
export type DisasterEventInsert = typeof disasterEvents.$inferInsert;
