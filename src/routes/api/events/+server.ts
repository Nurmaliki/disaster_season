import type { RequestHandler } from './$types';
import { aggregateEvents, queryEvents } from '$lib/server/services/aggregate';
import { apiSuccess, handleApiError } from '$lib/server/api/response';
import { eventFilterSchema, parseQuery } from '$lib/server/api/validation';
import { eventStore } from '$lib/server/services/merge';

/**
 * GET /api/events
 *
 * The unified event stream: every provider normalized into one model.
 * Supports type/category/severity/province/source/time filtering.
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

		const filtered = queryEvents(aggregate.events, {
			types,
			categories,
			severities,
			provinces,
			sources,
			sinceMs: sinceHours !== undefined ? sinceHours * 3600_000 : undefined,
			limit
		});

		return apiSuccess(filtered, {
			source: aggregate.sources.map((s) => s.name).join(', ') || 'BMKG',
			updatedAt: aggregate.updatedAt,
			cached: aggregate.sources.some((s) => s.cached),
			stale: aggregate.sources.some((s) => s.stale),
			partial: aggregate.partial,
			warnings: aggregate.warnings,
			count: filtered.length
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/events');
	}
};
