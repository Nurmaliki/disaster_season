import type { DisasterEvent, DisasterType, Severity } from '$lib/types';
import { aggregateEvents, queryEvents, type VolcanoPayload } from '$lib/server/services/aggregate';
import { getVolcanoes } from '$lib/server/services/aggregate';
import { assessRisk, eventRiskScore } from '$lib/server/risk/engine';
import { getAllProviderHealth, PROVIDER_DESCRIPTORS } from '$lib/server/services/health';
import { eventTimestamp, eventStore } from '$lib/server/services/merge';
import { readRecentEvents } from '$lib/server/db/repository';
import { logger } from '$lib/server/logger';

/**
 * Dashboard composition.
 *
 * This module assembles the homepage payload from already-cached provider data.
 * It performs NO new upstream calls beyond the aggregate, so the homepage is
 * bounded by the aggregate's own caching.
 */

export interface DashboardSummary {
	/** Highest-priority active official warnings. */
	activeWarnings: DisasterEvent[];
	/** Most recent earthquake records (current + recent). */
	recentEarthquakes: DisasterEvent[];
	/** Volcanoes currently above normal level (II/III/IV). */
	activeVolcanoes: DisasterEvent[];
	/** The highest-ranked events across all sources. */
	topEvents: DisasterEvent[];
	/** Counts by disaster type, for the summary chips. */
	countsByType: Record<string, number>;
	/** Counts by severity. */
	countsBySeverity: Record<Severity, number>;
	/** Volcano activity level distribution, when available. */
	volcanoLevels: Record<string, number>;
	/** Internal risk indicator — never an official warning. */
	risk: ReturnType<typeof assessRisk>;
	updatedAt: string;
	partial: boolean;
	warnings: string[];
	/** True when at least one provider returned data on this request. */
	hasData: boolean;
}

export interface DashboardOptions {
	/** How many items each section carries. */
	limit?: number;
	forceRefresh?: boolean;
}

/** Builds the full homepage payload. */
export async function getDashboard(options: DashboardOptions = {}): Promise<DashboardSummary> {
	const { limit = 8, forceRefresh = false } = options;

	const aggregate = await aggregateEvents({ forceRefresh });
	eventStore.put(aggregate.events);

	const activeWarnings = queryEvents(aggregate.events, {
		categories: ['early_warning'],
		limit
	});

	const recentEarthquakes = queryEvents(aggregate.events, {
		types: ['earthquake'],
		limit
	});

	const activeVolcanoes = queryEvents(aggregate.events, {
		types: ['volcano'],
		severities: ['critical', 'high', 'moderate'],
		limit
	});

	const topEvents = [...aggregate.events]
		.sort((a, b) => eventRiskScore(b) - eventRiskScore(a))
		.slice(0, limit);

	const risk = assessRisk({ events: aggregate.events });

	// Volcano level counts come from the volcano payload's own tally when the
	// provider parsed it; otherwise we derive them from the events themselves.
	let volcanoLevels: Record<string, number> = {};
	try {
		const volcanoPayload: VolcanoPayload = await getVolcanoes({ forceRefresh });
		volcanoLevels = volcanoPayload.counts ?? {};
	} catch (error) {
		logger.warn('volcano level counts unavailable for dashboard', { error });
		for (const event of aggregate.events) {
			if (event.type !== 'volcano') continue;
			const level = String(event.metadata?.level ?? 'unknown');
			volcanoLevels[level] = (volcanoLevels[level] ?? 0) + 1;
		}
	}

	const severityCounts = countSeverities(aggregate.events);

	return {
		activeWarnings,
		recentEarthquakes,
		activeVolcanoes,
		topEvents,
		countsByType: Object.fromEntries(countBy(aggregate.events, (e) => e.type)),
		countsBySeverity: severityCounts,
		volcanoLevels,
		risk,
		updatedAt: aggregate.updatedAt,
		partial: aggregate.partial,
		warnings: aggregate.warnings,
		hasData: aggregate.events.length > 0
	};
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

export interface StatisticsBucket {
	key: string;
	label: string;
	count: number;
}

export interface StatisticsResult {
	window: string;
	total: number;
	byType: StatisticsBucket[];
	bySeverity: StatisticsBucket[];
	byDay: StatisticsBucket[];
	bySource: StatisticsBucket[];
	byCategory: StatisticsBucket[];
	/** Earthquake magnitude distribution. */
	magnitudeBuckets: StatisticsBucket[];
	updatedAt: string;
	partial: boolean;
	/** True when durable history was available and merged into these counts. */
	persisted: boolean;
	/** Number of events read from durable history for this window. */
	persistedCount: number;
}

const TYPE_LABELS: Record<DisasterType, string> = {
	weather: 'Cuaca',
	extreme_weather: 'Cuaca Ekstrem',
	earthquake: 'Gempa Bumi',
	tsunami: 'Tsunami',
	flood: 'Banjir',
	flash_flood: 'Banjir Bandang',
	landslide: 'Tanah Longsor',
	volcano: 'Gunung Api',
	wildfire: 'Karhutla',
	drought: 'Kekeringan',
	high_wave: 'Gelombang Tinggi',
	abrasion: 'Abrasi',
	tornado: 'Puting Beliung',
	season: 'Musim',
	other: 'Lainnya'
};

/**
 * Computes statistics for a time window.
 *
 * Counts are derived exclusively from real events fetched from official
 * sources. When a window has few records this is reported honestly as a count,
 * never padded or extrapolated.
 *
 * When durable storage is configured, historical events from before this
 * instance started are merged in, so a long window is not silently truncated to
 * "whatever this process happens to have seen". The persisted counts are
 * reported via `persisted` so the UI can be honest about provenance.
 */
export async function getStatistics(
	windowMs: number,
	windowLabel: string,
	options: { forceRefresh?: boolean } = {}
): Promise<StatisticsResult> {
	const { forceRefresh = false } = options;
	const aggregate = await aggregateEvents({ forceRefresh });
	eventStore.put(aggregate.events);

	// Merge live events with anything durably stored for this window. The
	// database is best-effort: `readRecentEvents` returns null when unavailable.
	const persisted = await readRecentEvents(windowMs);
	const persistedCount = persisted?.length ?? 0;

	const byId = new Map<string, DisasterEvent>();
	for (const event of persisted ?? []) byId.set(event.id, event);
	// Live events win over stale persisted copies of the same id.
	for (const event of aggregate.events) byId.set(event.id, event);
	const merged = [...byId.values()];

	const cutoff = Date.now() - windowMs;
	const inWindow = merged.filter((event) => eventTimestamp(event) >= cutoff);

	return {
		window: windowLabel,
		total: inWindow.length,
		byType: countBy(inWindow, (e) => TYPE_LABELS[e.type] ?? e.type).map(([label, count]) => ({
			key: label,
			label,
			count
		})),
		bySeverity: severityBuckets(inWindow),
		byDay: bucketByDay(inWindow),
		bySource: countBy(inWindow, (e) => e.source.name).map(([key, count]) => ({
			key,
			label: key,
			count
		})),
		byCategory: countBy(inWindow, (e) => e.category).map(([key, count]) => ({
			key,
			label: CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] ?? key,
			count
		})),
		magnitudeBuckets: bucketMagnitudes(inWindow),
		updatedAt: aggregate.updatedAt,
		partial: aggregate.partial,
		persisted: persisted !== null,
		persistedCount
	};
}

const CATEGORY_LABELS = {
	forecast: 'Prakiraan',
	early_warning: 'Peringatan Dini',
	current_event: 'Kejadian Terkini',
	observation: 'Observasi',
	historical: 'Riwayat',
	hazard: 'Peta Bahaya',
	risk: 'Risiko'
} as const;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function countBy<T>(items: T[], keyFn: (item: T) => string): Array<[string, number]> {
	const map = new Map<string, number>();
	for (const item of items) {
		const key = keyFn(item);
		map.set(key, (map.get(key) ?? 0) + 1);
	}
	return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function countSeverities(events: DisasterEvent[]): Record<Severity, number> {
	const base: Record<Severity, number> = {
		critical: 0,
		high: 0,
		moderate: 0,
		low: 0,
		unknown: 0
	};
	for (const event of events) base[event.severity] += 1;
	return base;
}

/** Severity counts as an ordered bucket list for charts. */
function severityBuckets(events: DisasterEvent[]): StatisticsBucket[] {
	const counts = countSeverities(events);
	return (['critical', 'high', 'moderate', 'low', 'unknown'] as Severity[]).map((severity) => ({
		key: severity,
		label: SEVERITY_LABELS[severity],
		count: counts[severity]
	}));
}

const SEVERITY_LABELS: Record<Severity, string> = {
	critical: 'Kritis',
	high: 'Tinggi',
	moderate: 'Sedang',
	low: 'Rendah',
	unknown: 'Tidak diketahui'
};

/** Buckets events into calendar days (UTC) for the trend chart. */
function bucketByDay(events: DisasterEvent[]): StatisticsBucket[] {
	const map = new Map<string, number>();
	for (const event of events) {
		const ts = eventTimestamp(event);
		if (!ts) continue;
		const day = new Date(ts).toISOString().slice(0, 10);
		map.set(day, (map.get(day) ?? 0) + 1);
	}
	return [...map.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([key, count]) => ({ key, label: key, count }));
}

/** Standard magnitude bands used by BMKG reporting. */
function bucketMagnitudes(events: DisasterEvent[]): StatisticsBucket[] {
	const bands: Array<{ key: string; label: string; min: number; max: number }> = [
		{ key: 'lt4', label: '< 4,0', min: -Infinity, max: 4 },
		{ key: '4to5', label: '4,0 – 4,9', min: 4, max: 5 },
		{ key: '5to6', label: '5,0 – 5,9', min: 5, max: 6 },
		{ key: '6to7', label: '6,0 – 6,9', min: 6, max: 7 },
		{ key: 'ge7', label: '≥ 7,0', min: 7, max: Infinity }
	];

	const counts = bands.map(() => 0);

	for (const event of events) {
		if (event.type !== 'earthquake') continue;
		const magnitude = Number(event.metadata?.magnitude);
		if (!Number.isFinite(magnitude)) continue;
		const index = bands.findIndex((band) => magnitude >= band.min && magnitude < band.max);
		if (index >= 0) counts[index] += 1;
	}

	return bands.map((band, index) => ({ key: band.key, label: band.label, count: counts[index] }));
}

/* ------------------------------------------------------------------ */
/* Provider health / sources                                           */
/* ------------------------------------------------------------------ */

export interface SourceStatusView {
	id: string;
	name: string;
	attribution: string;
	url: string;
	domains: string[];
	status: string;
	latencyMs: number | null;
	lastSuccessAt: string | null;
	lastAttemptAt: string;
	lastError?: string;
}

/**
 * Returns the current health view for every declared provider.
 * Providers that have never been called are reported as `unconfigured` rather
 * than being optimistically labelled healthy.
 */
export function getSourceStatusView(): SourceStatusView[] {
	const health = getAllProviderHealth();
	const byId = new Map(health.map((h) => [h.id, h]));

	return PROVIDER_DESCRIPTORS.map((descriptor) => {
		const record = byId.get(descriptor.id);
		return {
			id: descriptor.id,
			name: descriptor.name,
			attribution: descriptor.attribution,
			url: descriptor.url,
			domains: descriptor.domains,
			status: record?.status ?? 'unconfigured',
			latencyMs: record?.latencyMs ?? null,
			lastSuccessAt: record?.lastSuccessAt ?? null,
			lastAttemptAt: record?.lastAttemptAt ?? new Date(0).toISOString(),
			lastError: record?.lastError
		};
	});
}
