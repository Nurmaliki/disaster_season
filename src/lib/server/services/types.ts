import type { DisasterEvent, DataCategory, DisasterType, ProviderMeta, Severity } from '$lib/types';

/** A provider's normalized output, ready to be merged into the unified stream. */
export interface NormalizedProviderPayload {
	provider: string;
	events: DisasterEvent[];
	/** Authority of this provider for its domains; higher wins in merges. */
	priority: number;
	retrievedAt: string;
	cached: boolean;
	stale: boolean;
	/** Set when the provider failed and this payload came from stale cache. */
	degraded?: boolean;
	error?: string;
}

export interface AggregateResult {
	events: DisasterEvent[];
	sources: Array<{
		provider: string;
		name: string;
		status: 'ok' | 'degraded' | 'unavailable';
		count: number;
		updatedAt: string | null;
		cached: boolean;
		stale: boolean;
		error?: string;
	}>;
	updatedAt: string;
	partial: boolean;
	warnings: string[];
}

export interface EventQuery {
	types?: DisasterType[];
	categories?: DataCategory[];
	severities?: Severity[];
	provinces?: string[];
	sinceMs?: number;
	untilMs?: number;
	sources?: string[];
	limit?: number;
	/** Restrict to a geographic bounding box. */
	bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
}

export type { ProviderMeta };
