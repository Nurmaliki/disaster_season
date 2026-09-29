import type { Geometry } from 'geojson';

/**
 * All hazard/disaster domains supported by the application.
 * Keep this list stable: it is used for filtering, icons, layers and risk rules.
 */
export type DisasterType =
	| 'weather'
	| 'extreme_weather'
	| 'earthquake'
	| 'tsunami'
	| 'flood'
	| 'flash_flood'
	| 'landslide'
	| 'volcano'
	| 'wildfire'
	| 'drought'
	| 'high_wave'
	| 'abrasion'
	| 'tornado'
	| 'season'
	| 'other';

/**
 * Data category. This is the single most important field for safety:
 * a FORECAST is never a warning, a HAZARD MAP is never a current event.
 */
export type DataCategory =
	'forecast' | 'early_warning' | 'current_event' | 'observation' | 'historical' | 'hazard' | 'risk';

export type Severity = 'unknown' | 'low' | 'moderate' | 'high' | 'critical';

export interface EventLocation {
	latitude: number;
	longitude: number;
	province?: string;
	provinceCode?: string;
	regency?: string;
	regencyCode?: string;
	district?: string;
	village?: string;
}

export interface EventSource {
	name: string;
	url?: string;
	/** Provider-native identifier, e.g. BMKG guid or MAGMA report id. */
	sourceId?: string;
	/** Authority ranking. Higher wins when two sources describe the same event. */
	priority?: number;
	retrievedAt?: string;
}

/**
 * Unified disaster data model.
 * Every provider is normalized into this shape before it reaches the app.
 */
export interface DisasterEvent {
	id: string;
	type: DisasterType;
	category: DataCategory;

	title: string;
	description?: string;

	severity: Severity;
	/** True when severity was assigned by our own rule engine, not the authority. */
	severityIsInternal?: boolean;

	location: EventLocation;

	geometry?: Geometry;

	occurredAt?: string;
	validFrom?: string;
	validUntil?: string;

	source: EventSource;

	/** ISO timestamp of the last time the *source* updated this record. */
	updatedAt: string;
	/** ISO timestamp of the last time *we* fetched it. */
	retrievedAt?: string;

	/** Additional provider-specific fields, always kept for transparency. */
	metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Provider contract                                                   */
/* ------------------------------------------------------------------ */

export interface ProviderMeta {
	/** Stable id used in logs, cache keys and the /status page. */
	id: string;
	name: string;
	/** The authority domain this provider owns. */
	domains: DisasterType[];
	url: string;
	attribution: string;
	/** Data category the provider's data maps to by default. */
	category: DataCategory;
	priority: number;
}

export interface FetchResult<T> {
	data: T;
	/** HTTP status of the upstream response, when applicable. */
	status?: number;
	retrievedAt: string;
	durationMs: number;
}

export interface DataProvider<TRaw, TNormalized> {
	readonly meta: ProviderMeta;
	/** Raw upstream fetch. Implementations must respect the given abort signal. */
	fetch(signal?: AbortSignal): Promise<FetchResult<TRaw>>;
	/** Convert raw upstream payload into the unified model. Must never throw on partial data. */
	normalize(raw: TRaw, retrievedAt: string): TNormalized[];
}

/* ------------------------------------------------------------------ */
/* API envelope                                                        */
/* ------------------------------------------------------------------ */

export interface ApiMeta {
	source: string;
	updatedAt: string;
	cached: boolean;
	stale?: boolean;
	partial?: boolean;
	/** Non-fatal issues encountered while building the response (e.g. provider down). */
	warnings?: string[];
	count?: number;
	/** True when this record was served from durable history, not the live feed. */
	fromHistory?: boolean;
	/** True when the result was computed by SQL over durable history. */
	searchedHistory?: boolean;
	/** Whether events could be searched at all (search endpoint). */
	eventsSearched?: boolean;
}

export interface ApiSuccess<T> {
	success: true;
	data: T;
	meta: ApiMeta;
}

export type ApiErrorCode =
	| 'NETWORK_ERROR'
	| 'PROVIDER_ERROR'
	| 'VALIDATION_ERROR'
	| 'RATE_LIMIT'
	| 'NOT_FOUND'
	| 'DATABASE_ERROR'
	| 'TIMEOUT';

export interface ApiFailure {
	success: false;
	error: {
		code: ApiErrorCode;
		message: string;
	};
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/* ------------------------------------------------------------------ */
/* Regions                                                             */
/* ------------------------------------------------------------------ */

export type RegionLevel = 'country' | 'province' | 'regency' | 'district' | 'village';

export interface Region {
	code: string;
	name: string;
	level: RegionLevel;
	parentCode: string | null;
	latitude?: number;
	longitude?: number;
}

/* ------------------------------------------------------------------ */
/* Risk engine                                                         */
/* ------------------------------------------------------------------ */

export interface RiskFactor {
	key: string;
	label: string;
	/** 0..1 normalized contribution before weighting. */
	value: number;
	weight: number;
	/** Human readable explanation of why this factor scored what it did. */
	reason: string;
}

export interface RiskAssessment {
	score: number;
	level: 'low' | 'moderate' | 'high' | 'very_high';
	factors: RiskFactor[];
	/** Mandatory disclaimer - this is never an official government warning. */
	disclaimer: string;
	generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Provider health                                                     */
/* ------------------------------------------------------------------ */

export type ProviderStatus = 'online' | 'degraded' | 'offline' | 'unconfigured';

export interface ProviderHealth {
	id: string;
	name: string;
	status: ProviderStatus;
	latencyMs: number | null;
	lastSuccessAt: string | null;
	lastAttemptAt: string;
	lastError?: string;
	attribution: string;
	url: string;
	domains: DisasterType[];
	cacheHit?: boolean;
}
