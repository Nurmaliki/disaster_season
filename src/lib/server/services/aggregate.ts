import type { DisasterEvent } from '$lib/types';
import { config } from '$lib/server/config';
import { cached, cacheKey } from '$lib/server/cache/index';
import { logger } from '$lib/server/logger';
import { recordFailure, recordSuccess } from '$lib/server/services/health';
import { mergeEvents, eventTimestamp, type NormalizedProviderPayload } from '$lib/server/services/merge';
import type { AggregateResult, EventQuery } from '$lib/server/services/types';

import {
	fetchEarthquakeFeed,
	type EarthquakeFeed
} from '$lib/server/providers/bmkg/earthquake';
import { normalizeEarthquakes } from '$lib/server/providers/bmkg/earthquake-normalizer';
import { fetchCapRss, fetchCapAlerts } from '$lib/server/providers/bmkg/warning';
import { normalizeWarnings } from '$lib/server/providers/bmkg/warning-normalizer';
import { fetchWeather } from '$lib/server/providers/bmkg/weather';
import { normalizeWeather, type NormalizedWeather } from '$lib/server/providers/bmkg/weather-normalizer';
import { fetchVolcanoActivity } from '$lib/server/providers/pvmbg/volcano';
import { normalizeVolcanoes } from '$lib/server/providers/pvmbg/volcano-normalizer';
import { probeInarisk } from '$lib/server/providers/inarisk/layers';
import { probeBnpb } from '$lib/server/providers/bnpb/disaster';

/* ------------------------------------------------------------------ */
/* Provider sync functions                                             */
/* ------------------------------------------------------------------ */

const EARTHQUAKE_FEEDS: EarthquakeFeed[] = ['autogempa', 'gempaterkini', 'gempadirasakan'];

/**
 * Fetches all BMKG earthquake feeds and normalizes them.
 * `gempaterkini` / `gempadirasakan` are historical records, so they are marked
 * accordingly and never presented as live events.
 */
export async function syncEarthquakes(): Promise<NormalizedProviderPayload> {
	const provider = 'bmkg-earthquake';
	const retrievedAt = new Date().toISOString();

	try {
		const started = Date.now();
		const results = await Promise.allSettled(
			EARTHQUAKE_FEEDS.map((feed) => fetchEarthquakeFeed(feed))
		);

		const events: DisasterEvent[] = [];
		const failures: string[] = [];

		results.forEach((result, index) => {
			const feed = EARTHQUAKE_FEEDS[index];
			if (result.status === 'fulfilled') {
				events.push(
					...normalizeEarthquakes(result.value.data, retrievedAt, {
						feed,
						// Only the single latest event is a "current event"; the list
						// feeds are a record of what happened recently.
						category: feed === 'autogempa' ? 'current_event' : 'historical'
					})
				);
			} else {
				failures.push(feed);
			}
		});

		if (events.length === 0) {
			throw new Error(`All earthquake feeds failed: ${failures.join(', ')}`);
		}

		recordSuccess(provider, Date.now() - started);
		logger.info('sync earthquakes ok', {
			provider,
			count: events.length,
			durationMs: Date.now() - started,
			failedFeeds: failures.length
		});

		return {
			provider,
			events,
			priority: 100,
			retrievedAt,
			cached: false,
			stale: false,
			degraded: failures.length > 0,
			error: failures.length ? `Feed tidak tersedia: ${failures.join(', ')}` : undefined
		};
	} catch (error) {
		recordFailure(provider, error);
		logger.error('sync earthquakes failed', { provider, error });
		throw error;
	}
}

/** Fetches and normalizes BMKG CAP early warnings. */
export async function syncWarnings(): Promise<NormalizedProviderPayload> {
	const provider = 'bmkg-warning';
	const retrievedAt = new Date().toISOString();

	try {
		const started = Date.now();
		const rss = await fetchCapRss();
		const { alerts, failed } = await fetchCapAlerts(rss.data, { limit: 30, concurrency: 4 });
		const events = normalizeWarnings(alerts, retrievedAt);

		recordSuccess(provider, Date.now() - started);
		logger.info('sync warnings ok', {
			provider,
			count: events.length,
			durationMs: Date.now() - started,
			failedDetails: failed
		});

		return {
			provider,
			events,
			priority: 100,
			retrievedAt,
			cached: false,
			stale: false,
			degraded: failed > 0,
			error: failed > 0 ? `${failed} detail peringatan gagal diambil` : undefined
		};
	} catch (error) {
		recordFailure(provider, error);
		logger.error('sync warnings failed', { provider, error });
		throw error;
	}
}

export interface VolcanoPayload extends NormalizedProviderPayload {
	counts: Record<string, number>;
}

/** Fetches PVMBG activity levels. Slow upstream, long cache TTL. */
export async function syncVolcanoes(): Promise<VolcanoPayload> {
	const provider = 'pvmbg-volcano';
	const retrievedAt = new Date().toISOString();

	try {
		const result = await fetchVolcanoActivity();
		const events = normalizeVolcanoes(result.volcanoes, retrievedAt);

		recordSuccess(provider, result.durationMs);
		logger.info('sync volcanoes ok', {
			provider,
			count: events.length,
			durationMs: result.durationMs
		});

		return {
			provider,
			events,
			priority: 100,
			retrievedAt,
			cached: false,
			stale: false,
			counts: result.counts as unknown as Record<string, number>
		};
	} catch (error) {
		recordFailure(provider, error);
		logger.error('sync volcanoes failed', { provider, error });
		throw error;
	}
}

/**
 * Probes BNPB and InaRISK reachability.
 *
 * Neither exposes a reachable public JSON API today, so this records real
 * availability for /status and returns zero events rather than inventing any.
 */
export async function syncUnavailableSources(): Promise<{
	bnpb: Awaited<ReturnType<typeof probeBnpb>>;
	inarisk: Awaited<ReturnType<typeof probeInarisk>>;
}> {
	const [bnpb, inarisk] = await Promise.all([probeBnpb(), probeInarisk()]);

	if (bnpb.reachable) recordSuccess('bnpb-disaster', bnpb.durationMs);
	else recordFailure('bnpb-disaster', bnpb.error ?? 'unreachable', bnpb.durationMs);

	if (inarisk.reachable) recordSuccess('inarisk-hazard', inarisk.durationMs);
	else recordFailure('inarisk-hazard', inarisk.error ?? 'unreachable', inarisk.durationMs);

	return { bnpb, inarisk };
}

/* ------------------------------------------------------------------ */
/* Cached aggregate accessors                                          */
/* ------------------------------------------------------------------ */

const STALE = {
	earthquake: config.staleTtl.earthquake,
	warning: config.staleTtl.warning,
	volcano: config.staleTtl.volcano
};

/** Earthquakes, cached ~2 min with 1 h stale fallback. */
export async function getEarthquakes(
	options: { forceRefresh?: boolean } = {}
): Promise<NormalizedProviderPayload> {
	const result = await cached(
		cacheKey('bmkg', 'earthquake'),
		config.ttl.earthquake,
		syncEarthquakes,
		{ staleSeconds: STALE.earthquake, forceRefresh: options.forceRefresh }
	);

	return {
		...result.data,
		cached: result.cached,
		stale: result.stale,
		degraded: result.data.degraded || result.degraded || result.stale
	};
}

/** Official early warnings, cached ~5 min with 1 h stale fallback. */
export async function getWarnings(
	options: { forceRefresh?: boolean } = {}
): Promise<NormalizedProviderPayload> {
	const result = await cached(cacheKey('bmkg', 'warning'), config.ttl.warning, syncWarnings, {
		staleSeconds: STALE.warning,
		forceRefresh: options.forceRefresh
	});

	return {
		...result.data,
		cached: result.cached,
		stale: result.stale,
		degraded: result.data.degraded || result.degraded || result.stale
	};
}

/** Volcano activity levels, cached ~30 min with 24 h stale fallback. */
export async function getVolcanoes(
	options: { forceRefresh?: boolean } = {}
): Promise<VolcanoPayload> {
	const result = await cached(cacheKey('pvmbg', 'volcano'), config.ttl.volcano, syncVolcanoes, {
		staleSeconds: STALE.volcano,
		forceRefresh: options.forceRefresh
	});

	return {
		...result.data,
		cached: result.cached,
		stale: result.stale,
		degraded: result.degraded || result.stale
	};
}

/** Weather for a region, cached ~15 min with 2 h stale fallback. */
export async function getWeather(
	adm4: string,
	options: { forceRefresh?: boolean } = {}
): Promise<{ weather: NormalizedWeather; cached: boolean; stale: boolean; degraded: boolean }> {
	const provider = 'bmkg-weather';

	const result = await cached(
		cacheKey('bmkg', 'weather', adm4),
		config.ttl.weather,
		async () => {
			const started = Date.now();
			try {
				const fetched = await fetchWeather(4, adm4);
				const weather = normalizeWeather(fetched.data, new Date().toISOString());
				recordSuccess(provider, Date.now() - started);
				return weather;
			} catch (error) {
				recordFailure(provider, error, Date.now() - started);
				throw error;
			}
		},
		{ staleSeconds: config.staleTtl.weather, forceRefresh: options.forceRefresh }
	);

	return {
		weather: result.data,
		cached: result.cached,
		stale: result.stale,
		degraded: Boolean(result.degraded) || result.stale
	};
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Aggregates every available source into one event stream.
 *
 * Design decisions:
 *  - Each provider is fetched through its own cache, so a slow PVMBG scrape
 *    never delays the earthquake feed.
 *  - A provider failure degrades the result rather than failing the request.
 *  - `partial: true` is set whenever any source was unavailable, which the UI
 *    surfaces so users know the picture is incomplete.
 */
export async function aggregateEvents(
	options: { includeVolcanoes?: boolean; forceRefresh?: boolean } = {}
): Promise<AggregateResult> {
	const { includeVolcanoes = true, forceRefresh = false } = options;

	const tasks: Array<Promise<NormalizedProviderPayload>> = [
		getEarthquakes({ forceRefresh }),
		getWarnings({ forceRefresh })
	];
	if (includeVolcanoes) tasks.push(getVolcanoes({ forceRefresh }));

	const settled = await Promise.allSettled(tasks);

	const payloads: NormalizedProviderPayload[] = [];
	const sources: AggregateResult['sources'] = [];
	const warnings: string[] = [];

	const names: Record<string, string> = {
		'bmkg-earthquake': 'BMKG — Gempa Bumi',
		'bmkg-warning': 'BMKG — Peringatan Dini Cuaca',
		'pvmbg-volcano': 'PVMBG / MAGMA — Gunung Api'
	};

	settled.forEach((outcome, index) => {
		const providerId = ['bmkg-earthquake', 'bmkg-warning', 'pvmbg-volcano'][index] ?? `provider-${index}`;

		if (outcome.status === 'fulfilled') {
			payloads.push(outcome.value);
			sources.push({
				provider: outcome.value.provider,
				name: names[outcome.value.provider] ?? outcome.value.provider,
				status: outcome.value.degraded ? 'degraded' : 'ok',
				count: outcome.value.events.length,
				updatedAt: outcome.value.retrievedAt,
				cached: outcome.value.cached,
				stale: outcome.value.stale,
				error: outcome.value.error
			});
			if (outcome.value.error) warnings.push(`${names[outcome.value.provider]}: ${outcome.value.error}`);
		} else {
			sources.push({
				provider: providerId,
				name: names[providerId] ?? providerId,
				status: 'unavailable',
				count: 0,
				updatedAt: null,
				cached: false,
				stale: false,
				error: 'Data sementara tidak tersedia'
			});
			warnings.push(`${names[providerId] ?? providerId}: data sementara tidak tersedia`);
			logger.warn('provider unavailable during aggregation', { provider: providerId });
		}
	});

	const events = mergeEvents(payloads);

	return {
		events,
		sources,
		updatedAt: new Date().toISOString(),
		partial: sources.some((s) => s.status !== 'ok'),
		warnings
	};
}

/* ------------------------------------------------------------------ */
/* Query filtering                                                     */
/* ------------------------------------------------------------------ */

/** Applies an EventQuery to a list of events. Pure and deterministic. */
export function queryEvents(events: DisasterEvent[], query: EventQuery = {}): DisasterEvent[] {
	const now = Date.now();
	let result = events;

	if (query.types?.length) {
		const set = new Set(query.types);
		result = result.filter((event) => set.has(event.type));
	}

	if (query.categories?.length) {
		const set = new Set(query.categories);
		result = result.filter((event) => set.has(event.category));
	}

	if (query.severities?.length) {
		const set = new Set(query.severities);
		result = result.filter((event) => set.has(event.severity));
	}

	if (query.sources?.length) {
		const set = new Set(query.sources.map((s) => s.toLowerCase()));
		result = result.filter((event) => set.has(event.source.name.toLowerCase()));
	}

	if (query.provinces?.length) {
		const set = new Set(query.provinces.map((p) => p.toLowerCase()));
		result = result.filter((event) => {
			const province = event.location.province?.toLowerCase();
			return province ? set.has(province) : false;
		});
	}

	if (query.sinceMs !== undefined) {
		const cutoff = now - query.sinceMs;
		result = result.filter((event) => eventTimestamp(event) >= cutoff);
	}

	if (query.untilMs !== undefined) {
		result = result.filter((event) => eventTimestamp(event) <= query.untilMs!);
	}

	if (query.bbox) {
		const { minLon, minLat, maxLon, maxLat } = query.bbox;
		result = result.filter((event) => {
			const { latitude, longitude } = event.location;
			if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
			// Events without a known location (0,0 placeholder) are excluded from
			// geographic queries rather than being treated as off West Africa.
			if (latitude === 0 && longitude === 0) return false;
			return (
				longitude >= minLon && longitude <= maxLon && latitude >= minLat && latitude <= maxLat
			);
		});
	}

	if (query.limit !== undefined) {
		result = result.slice(0, query.limit);
	}

	return result;
}
