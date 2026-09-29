import type { DisasterEvent, ProviderHealth, ProviderStatus } from '$lib/types';

/**
 * In-process provider health registry.
 *
 * STATUS IS EARNED, NOT ASSUMED: a provider is only "online" after a real
 * successful upstream call. The /status page reads this registry, so it can
 * never claim a provider is healthy merely because the app is running.
 *
 * The registry also survives process restarts on Vercel only within a warm
 * instance, which is acceptable: the /status endpoint performs live probes, and
 * this table provides the historical/last-known view.
 */

export interface ProviderRecord {
	id: string;
	name: string;
	attribution: string;
	url: string;
	domains: string[];
	lastAttemptAt: string | null;
	lastSuccessAt: string | null;
	lastError: string | null;
	latencyMs: number | null;
	successCount: number;
	failureCount: number;
	consecutiveFailures: number;
}

const registry = new Map<string, ProviderRecord>();

export interface ProviderDescriptor {
	id: string;
	name: string;
	attribution: string;
	url: string;
	domains: string[];
}

/** Declares a provider so it appears on /status before its first call. */
export function registerProvider(descriptor: ProviderDescriptor): void {
	if (registry.has(descriptor.id)) {
		const existing = registry.get(descriptor.id)!;
		existing.name = descriptor.name;
		existing.attribution = descriptor.attribution;
		existing.url = descriptor.url;
		existing.domains = descriptor.domains;
		return;
	}
	registry.set(descriptor.id, {
		...descriptor,
		lastAttemptAt: null,
		lastSuccessAt: null,
		lastError: null,
		latencyMs: null,
		successCount: 0,
		failureCount: 0,
		consecutiveFailures: 0
	});
}

export function recordSuccess(id: string, latencyMs: number): void {
	const record = registry.get(id);
	if (!record) return;
	const now = new Date().toISOString();
	record.lastAttemptAt = now;
	record.lastSuccessAt = now;
	record.lastError = null;
	record.latencyMs = latencyMs;
	record.successCount += 1;
	record.consecutiveFailures = 0;
}

export function recordFailure(id: string, error: unknown, latencyMs?: number): void {
	const record = registry.get(id);
	if (!record) return;
	record.lastAttemptAt = new Date().toISOString();
	record.lastError = error instanceof Error ? error.message : String(error);
	if (latencyMs !== undefined) record.latencyMs = latencyMs;
	record.failureCount += 1;
	record.consecutiveFailures += 1;
}

/**
 * Derives the displayed status from real outcomes.
 * - online: the most recent attempt succeeded
 * - degraded: successes exist but the last attempt failed, or it is stale
 * - offline: configured but never succeeded, or repeated failures
 * - unconfigured: never attempted at all
 */
export function getProviderHealth(id: string): ProviderHealth | null {
	const record = registry.get(id);
	if (!record) return null;

	const successAt = record.lastSuccessAt ? new Date(record.lastSuccessAt).getTime() : null;
	const attemptAt = record.lastAttemptAt ? new Date(record.lastAttemptAt).getTime() : null;

	let status: ProviderStatus;
	if (!record.lastAttemptAt) status = 'unconfigured';
	else if (record.lastSuccessAt && successAt === attemptAt) status = 'online';
	else if (record.lastSuccessAt) status = 'degraded';
	else status = 'offline';

	// A provider whose last success is very old is degraded even if it has not
	// been retried, because we cannot vouch for the freshness of its data.
	if (status === 'online' && successAt !== null) {
		const ageMinutes = (Date.now() - successAt) / 60_000;
		if (ageMinutes > 60) status = 'degraded';
	}

	return {
		id: record.id,
		name: record.name,
		status,
		latencyMs: record.latencyMs,
		lastSuccessAt: record.lastSuccessAt,
		lastAttemptAt: record.lastAttemptAt ?? new Date(0).toISOString(),
		lastError: record.lastError ?? undefined,
		attribution: record.attribution,
		url: record.url,
		domains: record.domains as ProviderHealth['domains']
	};
}

export function getAllProviderHealth(): ProviderHealth[] {
	return [...registry.keys()]
		.map((id) => getProviderHealth(id))
		.filter((h): h is ProviderHealth => h !== null);
}

export function getProviderRecord(id: string): ProviderRecord | null {
	return registry.get(id) ?? null;
}

/** Test helper: clears all recorded state. */
export function resetHealthRegistry(): void {
	registry.clear();
}

/* ------------------------------------------------------------------ */
/* Provider descriptors (single source of truth)                       */
/* ------------------------------------------------------------------ */

export const PROVIDER_DESCRIPTORS: ProviderDescriptor[] = [
	{
		id: 'bmkg-earthquake',
		name: 'BMKG — Gempa Bumi',
		attribution: 'Badan Meteorologi, Klimatologi, dan Geofisika (BMKG)',
		url: 'https://data.bmkg.go.id/gempabumi/',
		domains: ['earthquake', 'tsunami']
	},
	{
		id: 'bmkg-weather',
		name: 'BMKG — Prakiraan Cuaca',
		attribution: 'Badan Meteorologi, Klimatologi, dan Geofisika (BMKG)',
		url: 'https://api.bmkg.go.id/publik/prakiraan-cuaca',
		domains: ['weather']
	},
	{
		id: 'bmkg-warning',
		name: 'BMKG — Peringatan Dini Cuaca (CAP)',
		attribution: 'Badan Meteorologi, Klimatologi, dan Geofisika (BMKG)',
		url: 'https://www.bmkg.go.id/alerts/nowcast/id/rss.xml',
		domains: ['extreme_weather', 'flood', 'landslide', 'tornado']
	},
	{
		id: 'pvmbg-volcano',
		name: 'PVMBG / MAGMA — Gunung Api',
		attribution: 'Pusat Vulkanologi dan Mitigasi Bencana Geologi (PVMBG) — MAGMA Indonesia',
		url: 'https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas',
		domains: ['volcano']
	},
	{
		id: 'bnpb-disaster',
		name: 'BNPB — Kejadian Bencana (DIBI)',
		attribution: 'Badan Nasional Penanggulangan Bencana (BNPB)',
		url: 'https://bnpb.go.id',
		domains: ['flood', 'landslide', 'wildfire', 'extreme_weather']
	},
	{
		id: 'inarisk-hazard',
		name: 'InaRISK — Peta Bahaya & Risiko',
		attribution: 'InaRISK — Badan Nasional Penanggulangan Bencana (BNPB)',
		url: 'https://inarisk.bnpb.go.id',
		domains: ['flood', 'landslide', 'wildfire', 'drought']
	}
];

export function registerAllProviders(): void {
	for (const descriptor of PROVIDER_DESCRIPTORS) registerProvider(descriptor);
}

registerAllProviders();
