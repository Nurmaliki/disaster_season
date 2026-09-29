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
