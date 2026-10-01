import type { DisasterEvent, ProviderHealth, Region, RiskAssessment, Severity } from '$lib/types';

/**
 * Response shapes for our own API gateway.
 *
 * These mirror exactly what the /api/* routes return. Keeping them in one place
 * means the frontend and backend cannot silently drift apart, and components get
 * full type-safety on what they render.
 */

export interface DashboardPayload {
	activeWarnings: DisasterEvent[];
	recentEarthquakes: DisasterEvent[];
	activeVolcanoes: DisasterEvent[];
	topEvents: DisasterEvent[];
	countsByType: Record<string, number>;
	countsBySeverity: Record<Severity, number>;
	volcanoLevels: Record<string, number>;
	risk: RiskAssessment;
	updatedAt: string;
	partial: boolean;
	warnings: string[];
	hasData: boolean;
}

export interface VolcanoPayload {
	volcanoes: DisasterEvent[];
	counts: Record<string, number>;
}

export interface StatisticsBucket {
	key: string;
	label: string;
	count: number;
}

export interface StatisticsPayload {
	window: string;
	total: number;
	byType: StatisticsBucket[];
	bySeverity: StatisticsBucket[];
	byDay: StatisticsBucket[];
	bySource: StatisticsBucket[];
	byCategory: StatisticsBucket[];
	magnitudeBuckets: StatisticsBucket[];
	updatedAt: string;
	partial: boolean;
}

export interface SourceDescriptor {
	id: string;
	name: string;
	attribution: string;
	url: string;
	domains: string[];
	categories: string[];
	notes?: string;
}

export interface SourcesPayload {
	sources: SourceDescriptor[];
	disclaimer: string;
}

export interface StatusPayload {
	observed: ProviderHealth[];
	providers: Array<{
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
	}>;
	declaredCount: number;
	liveProbe: Record<string, unknown> | null;
	persistence: {
		enabled: boolean;
		mode: 'stateless' | 'durable';
		retentionDays: number | null;
	};
	cache: {
		scope: 'per-instance';
		entries: number;
	};
}

export interface RiskPayload extends RiskAssessment {
	scope: { level: 'country' | 'province'; code: string; name: string };
	weights: Record<string, number>;
	bands: Record<string, { min: number; max: number; label: string }>;
}

export interface NearbyPayload {
	center: { latitude: number; longitude: number };
	radiusKm: number;
	events: DisasterEvent[];
	approxProvince: string | null;
}

export interface RegionsPayload {
	province: Region | null;
	regencies: Region[];
}

/** One wind probe point: a flow vector plus the compass it blows from. */
export interface WindSample {
	latitude: number;
	longitude: number;
	/** Eastward flow component, km/h (positive = air moving east). */
	u: number;
	/** Northward flow component, km/h (positive = air moving north). */
	v: number;
	speedKmh: number;
	fromDirection: string | null;
}

export interface WindPayload {
	samples: WindSample[];
	updatedAt: string;
	partial: boolean;
}

/** One forecast slot, as returned by GET /api/weather. */
export interface WeatherSlot {
	datetime: string;
	localDatetime: string;
	timezone: string;
	temperatureC: number | null;
	humidity: number | null;
	condition: string;
	conditionEn: string;
	cloudCoverPct: number | null;
	precipitationMm: number | null;
	windSpeedKmh: number | null;
	windDirection: string | null;
	windDirectionDeg: number | null;
	iconUrl: string | null;
}

/** Payload of GET /api/weather — BMKG forecast for one adm4 village. */
export interface WeatherPayload {
	location: {
		adm1: string;
		adm2: string;
		adm3: string;
		adm4: string;
		province: string;
		regency: string;
		district: string;
		village: string;
		latitude: number;
		longitude: number;
		timezone: string;
	};
	slots: WeatherSlot[];
	current: WeatherSlot | null;
	daily: Array<{
		date: string;
		label: string;
		minTempC: number | null;
		maxTempC: number | null;
		dominantCondition: string;
		maxPrecipitationMm: number | null;
		iconUrl: string | null;
	}>;
	severity: Severity;
	severityReason: string;
	source: { name: string; url: string };
	updatedAt: string;
}

export type SearchResultKind = 'region' | 'earthquake' | 'warning' | 'volcano';

export interface SearchResult {
	kind: SearchResultKind;
	id: string;
	title: string;
	subtitle: string;
	/** Pre-resolved pathname, provided for API consumers. */
	href: string;
	latitude?: number;
	longitude?: number;
}

export interface SearchPayload {
	regions: SearchResult[];
	events: SearchResult[];
	/** False when events could not be searched (provider failure). */
	eventsSearched: boolean;
}

export type { DisasterEvent, ProviderHealth, Region, RiskAssessment };
