import type { DisasterEvent } from '$lib/types';
import type { NormalizedProviderPayload } from '$lib/server/services/types';

export type { NormalizedProviderPayload };

/**
 * Deduplication and provenance merging.
 *
 * Rules, in order of authority:
 *   1. Same source + same sourceId  -> identical record, keep one.
 *   2. Same event id                -> keep the record from the higher-priority source.
 *   3. Otherwise                    -> distinct events, keep both.
 *
 * Merging never overwrites a higher-authority source with a lower one; it records
 * both under `metadata.provenance` so the UI can show where each fact came from.
 */

export interface ProvenanceEntry {
	source: string;
	sourceId?: string;
	retrievedAt?: string;
	priority: number;
}

export function eventDedupeKey(event: DisasterEvent): string {
	// Prefer the explicit provider identity, which is stable across fetches.
	const sourceId = event.source.sourceId;
	if (sourceId) return `${event.source.name}::${sourceId}`;
	return event.id;
}

/**
 * Merges and deduplicates events from multiple providers.
 * Output is sorted most-severe and most-recent first.
 */
export function mergeEvents(payloads: NormalizedProviderPayload[]): DisasterEvent[] {
	const byKey = new Map<string, DisasterEvent>();
	const provenance = new Map<string, ProvenanceEntry[]>();

	for (const payload of payloads) {
		for (const event of payload.events) {
			const key = eventDedupeKey(event);
			const existing = byKey.get(key);
			const priority = event.source.priority ?? payload.priority ?? 0;

			if (!existing) {
				byKey.set(key, event);
				provenance.set(key, [
					{
						source: event.source.name,
						sourceId: event.source.sourceId,
						retrievedAt: event.source.retrievedAt ?? event.retrievedAt,
						priority
					}
				]);
				continue;
			}

			// Record the competing source even when we keep the existing record.
			const list = provenance.get(key) ?? [];
			if (
				!list.some((p) => p.source === event.source.name && p.sourceId === event.source.sourceId)
			) {
				list.push({
					source: event.source.name,
					sourceId: event.source.sourceId,
					retrievedAt: event.source.retrievedAt ?? event.retrievedAt,
					priority
				});
			}
			provenance.set(key, list);

			const existingPriority = existing.source.priority ?? 0;
			if (priority > existingPriority) {
				// The new record outranks the stored one, but we retain the full
				// provenance chain so nothing is silently lost.
				byKey.set(key, {
					...event,
					metadata: { ...event.metadata, provenance: list }
				});
			} else {
				byKey.set(key, {
					...existing,
					metadata: { ...existing.metadata, provenance: list }
				});
			}
		}
	}

	return ensureUniqueIds([...byKey.values()]).sort(compareEvents);
}

/**
 * Guarantees every returned event has a unique `id`.
 *
 * Distinct records can legitimately share an `id` when providers publish the
 * same event under different source ids (or when the id falls back to a content
 * hash computed from slightly different raw fields). The merge key
 * (`source::sourceId`) keeps those records apart, but an `id` collision would
 * then reach keyed UI lists and crash rendering, so we disambiguate here.
 *
 * The first occurrence keeps the original id; later collisions get a stable
 * `#<n>` suffix derived from their position, so the id is deterministic for a
 * given input set.
 */
function ensureUniqueIds(events: DisasterEvent[]): DisasterEvent[] {
	const used = new Set<string>();
	const out: DisasterEvent[] = [];

	for (const event of events) {
		if (!used.has(event.id)) {
			used.add(event.id);
			out.push(event);
			continue;
		}

		let suffix = 2;
		let candidate = `${event.id}#${suffix}`;
		while (used.has(candidate)) {
			suffix += 1;
			candidate = `${event.id}#${suffix}`;
		}
		used.add(candidate);
		out.push({ ...event, id: candidate });
	}

	return out;
}

const SEVERITY_RANK: Record<DisasterEvent['severity'], number> = {
	critical: 5,
	high: 4,
	moderate: 3,
	low: 2,
	unknown: 1
};

/**
 * Orders events for display: official warnings first, then severity,
 * then recency. Because an active warning outranks a forecast regardless of
 * severity, category is compared before severity.
 */
export function compareEvents(a: DisasterEvent, b: DisasterEvent): number {
	const categoryRank = (event: DisasterEvent): number => {
		switch (event.category) {
			case 'early_warning':
				return 0;
			case 'current_event':
				return 1;
			case 'observation':
				return 2;
			case 'forecast':
				return 3;
			case 'risk':
				return 4;
			case 'hazard':
				return 5;
			case 'historical':
				return 6;
			default:
				return 7;
		}
	};

	const categoryDiff = categoryRank(a) - categoryRank(b);
	if (categoryDiff !== 0) return categoryDiff;

	const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
	if (severityDiff !== 0) return severityDiff;

	const aTime = eventTimestamp(a);
	const bTime = eventTimestamp(b);
	return bTime - aTime;
}

/** Best available timestamp for an event, preferring occurrence then validity. */
export function eventTimestamp(event: DisasterEvent): number {
	const candidate = event.occurredAt ?? event.validFrom ?? event.updatedAt;
	const parsed = candidate ? new Date(candidate).getTime() : 0;
	return Number.isFinite(parsed) ? parsed : 0;
}

/* ------------------------------------------------------------------ */
/* Event store (in-process, for detail pages and history)              */
/* ------------------------------------------------------------------ */

/**
 * A small in-process store so /event/[id] can resolve a specific event without
 * re-fetching every provider. Populated as a side effect of dashboard/map loads.
 *
 * On serverless this is per-instance and therefore best-effort — the detail page
 * falls back to re-querying providers when the id is not present, and says so
 * rather than showing a hard 404 for a real event.
 */
const MAX_STORED_EVENTS = 2000;

class EventStore {
	private events = new Map<string, { event: DisasterEvent; storedAt: number }>();

	put(events: DisasterEvent[]): void {
		const now = Date.now();
		for (const event of events) {
			this.events.set(event.id, { event, storedAt: now });
		}
		this.prune();
	}

	get(id: string): DisasterEvent | null {
		return this.events.get(id)?.event ?? null;
	}

	all(): DisasterEvent[] {
		return [...this.events.values()].map((entry) => entry.event);
	}

	/** Events within a time window, newest first. Used for history and statistics. */
	since(sinceMs: number): DisasterEvent[] {
		const cutoff = Date.now() - sinceMs;
		return this.all()
			.filter((event) => eventTimestamp(event) >= cutoff)
			.sort((a, b) => eventTimestamp(b) - eventTimestamp(a));
	}

	size(): number {
		return this.events.size;
	}

	clear(): void {
		this.events.clear();
	}

	private prune(): void {
		if (this.events.size <= MAX_STORED_EVENTS) return;
		const sorted = [...this.events.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
		for (const [id] of sorted.slice(0, sorted.length - MAX_STORED_EVENTS)) {
			this.events.delete(id);
		}
	}
}

export const eventStore = new EventStore();
