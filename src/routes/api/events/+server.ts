import type { RequestHandler } from './$types';
import { aggregateEvents, queryEvents, withHistory } from '$lib/server/services/aggregate';
import { apiSuccess, handleApiError } from '$lib/server/api/response';
import { eventFilterSchema, parseQuery } from '$lib/server/api/validation';
import { eventStore } from '$lib/server/services/merge';

/**
 * GET /api/events
 *
 * The unified event stream: every provider normalized into one model.
 * Supports type/category/severity/province/source/time filtering.
 *
 * When durable storage is configured, persisted history for the requested
 * window is merged in (live events winning), so a long `sinceHours` returns
 * everything we hold rather than only what this process happens to have seen.
 * `meta.searchedHistory` reports whether that happened.
 *
 * A provider outage degrades the response (`meta.partial`) rather than failing it.
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const parsed = parseQuery(eventFilterSchema, url);
		if (!parsed.ok) {
			return apiSuccess([], { source: 'internal', updatedAt: new Date().toISOString() });
		}

		const { types, categories, severities, provinces, sources, sinceHours, limit } = parsed.data;

		const aggregate = await aggregateEvents();

		// Keep the detail store warm so /event/[id] can resolve these events.
		eventStore.put(aggregate.events);

		// Bound the history read by the requested window when one was given.
		const sinceMs = sinceHours !== undefined ? sinceHours * 3600_000 : undefined;
		// Read generously from history so paging `limit` does not hide older rows.
		const historyLimit = limit !== undefined ? Math.max(limit, 500) : 2000;
		const { events: candidates, fromHistory } = await withHistory(aggregate.events, {
			sinceMs,
			limit: historyLimit
		});

		const filtered = queryEvents(candidates, {
			types,
			categories,
			severities,
			provinces,
			sources,
			sinceMs,
			limit
		});

		return apiSuccess(filtered, {
			source: aggregate.sources.map((s) => s.name).join(', ') || 'BMKG',
			updatedAt: aggregate.updatedAt,
			cached: aggregate.sources.some((s) => s.cached),
			stale: aggregate.sources.some((s) => s.stale),
			partial: aggregate.partial,
			warnings: aggregate.warnings,
			count: filtered.length,
			searchedHistory: fromHistory
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/events');
	}
};
