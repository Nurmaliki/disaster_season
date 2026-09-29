import type { DisasterEvent, Region } from '$lib/types';
import { searchRegions } from '$lib/utils/regions';
import { aggregateEvents } from '$lib/server/services/aggregate';

/**
 * Unified search across everything the app can link to internally.
 *
 * A disaster monitor is searched by place AND by event: a user may type
 * "bandung", "gempa", "merapi" or "banjir". Searching only regions (as the
 * original combobox did) silently fails on the latter three, which is a real
 * usability gap rather than a cosmetic one.
 *
 * Design constraints:
 *  - Search matches only against fields we actually hold. There is no fuzzy
 *    synonym expansion that could invent relevance.
 *  - Every result carries its `kind` and enough data to link to a real page.
 *  - Region matches come from the static BPS/BIG table (always available).
 *    Event matches come from the live aggregate; if a provider is down, search
 *    simply returns fewer event hits rather than failing.
 */

export type SearchResultKind = 'region' | 'earthquake' | 'warning' | 'volcano';

export interface SearchResult {
	kind: SearchResultKind;
	/** Stable id: region code, or event id. */
	id: string;
	title: string;
	/** Secondary line, e.g. level label or event type/severity. */
	subtitle: string;
	/** In-app href (already resolved to a pathname). */
	href: string;
	/** For the map/geo hint, when the matched item has coordinates. */
	latitude?: number;
	longitude?: number;
}

export interface SearchResults {
	regions: SearchResult[];
	events: SearchResult[];
	/** True when at least one provider contributed events to this search. */
	eventsSearched: boolean;
}

const MIN_QUERY = 2;

/** Normalizes for case- and diacritic-insensitive matching. */
function normalize(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

/** Region level → Indonesian label used as the result subtitle. */
const REGION_LEVEL_LABELS: Record<Region['level'], string> = {
	country: 'Negara',
	province: 'Provinsi',
	regency: 'Kabupaten/Kota',
	district: 'Kecamatan',
	village: 'Desa/Kelurahan'
};

const EVENT_KIND_LABELS: Record<SearchResultKind, string> = {
	region: 'Wilayah',
	earthquake: 'Gempa',
	warning: 'Peringatan Dini',
	volcano: 'Gunung Api'
};

/**
 * Runs a unified search.
 *
 * @param query raw user input
 * @param limitPerGroup maximum results per group
 */
export async function searchEverything(query: string, limitPerGroup = 6): Promise<SearchResults> {
	const trimmed = query.trim();
	if (trimmed.length < MIN_QUERY) {
		return { regions: [], events: [], eventsSearched: false };
	}

	// Regions are a synchronous local table.
	const regions: SearchResult[] = searchRegions(trimmed, limitPerGroup).map((region) => ({
		kind: 'region' as const,
		id: region.code,
		title: region.name,
		subtitle: REGION_LEVEL_LABELS[region.level],
		href: `/location/${encodeURIComponent(region.code)}`,
		latitude: region.latitude,
		longitude: region.longitude
	}));

	// Events come from the live aggregate. A failure here must not fail search.
	let events: SearchResult[] = [];
	let eventsSearched: boolean;
	try {
		const aggregate = await aggregateEvents();
		eventsSearched = true;

		const needle = normalize(trimmed);
		const matches = aggregate.events.filter((event) => eventMatches(event, needle));

		events = matches
			// Prefer the most severe, then the most recent — a real ordering, not
			// an arbitrary one.
			.sort(
				(a, b) =>
					severityRank(b.severity) - severityRank(a.severity) || timestampOf(b) - timestampOf(a)
			)
			.slice(0, limitPerGroup)
			.map(toEventResult);
	} catch {
		// Provider failure: return region hits only, with eventsSearched=false so
		// the UI can say so honestly instead of showing "0 events".
		eventsSearched = false;
	}

	return { regions, events, eventsSearched };
}

/** Whether an event matches the normalized needle in any searchable field. */
function eventMatches(event: DisasterEvent, needle: string): boolean {
	const haystack = [
		event.title,
		event.description ?? '',
		event.location.province ?? '',
		event.location.regency ?? '',
		event.location.district ?? '',
		event.location.village ?? '',
		event.source.name,
		eventTypeLabel(event)
	]
		.map(normalize)
		.join(' ');

	return haystack.includes(needle);
}

/** Indonesian label for an event's disaster type, used in matching and display. */
function eventTypeLabel(event: DisasterEvent): string {
	const labels: Record<string, string> = {
		earthquake: 'gempa gempa bumi earthquake',
		tsunami: 'tsunami',
		extreme_weather: 'cuaca ekstrem hujan badai',
		weather: 'cuaca hujan',
		flood: 'banjir',
		flash_flood: 'banjir bandang',
		landslide: 'tanah longsor longsor',
		volcano: 'gunung api gunung berapi vulkanik',
		wildfire: 'karhutla kebakaran hutan',
		drought: 'kekeringan',
		high_wave: 'gelombang tinggi',
		abrasion: 'abrasi',
		tornado: 'puting beliung angin',
		season: 'musim',
		other: 'lainnya'
	};
	return labels[event.type] ?? event.type;
}

function severityRank(severity: DisasterEvent['severity']): number {
	switch (severity) {
		case 'critical':
			return 4;
		case 'high':
			return 3;
		case 'moderate':
			return 2;
		case 'low':
			return 1;
		default:
			return 0;
	}
}

function timestampOf(event: DisasterEvent): number {
	const raw = event.occurredAt ?? event.validFrom ?? event.updatedAt;
	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Maps an event to the right internal destination based on its kind. */
function toEventResult(event: DisasterEvent): SearchResult {
	const kind: SearchResultKind =
		event.type === 'earthquake' ? 'earthquake' : event.type === 'volcano' ? 'volcano' : 'warning';

	// Earthquakes and volcanoes have generic list/detail affordances; warnings
	// have a dedicated list. Detail pages exist for every event id.
	const href = `/event/${encodeURIComponent(event.id)}`;

	return {
		kind,
		id: event.id,
		title: event.title,
		subtitle: `${EVENT_KIND_LABELS[kind]} · ${event.source.name}`,
		href,
		latitude: event.location.latitude,
		longitude: event.location.longitude
	};
}
