import type { DataProvider, DisasterEvent, ProviderMeta } from '$lib/types';
import { fetchJson } from '$lib/server/http.ts';
import { logger } from '$lib/server/logger.ts';
import { config } from '$lib/server/config.ts';

/**
 * BNPB / InaRISK hazard & risk layers.
 *
 * STATUS (verified live, 2026): `inarisk.bnpb.go.id` and `bnpb.go.id` resolve in
 * DNS but do not complete a TLS handshake / TCP connection from general-purpose
 * hosting. There is no documented, publicly reachable JSON API for hazard or
 * risk layers at this time.
 *
 * Rather than invent data, this provider:
 *   1. attempts a real request so /status reports the truth, and
 *   2. returns zero events on failure so the map renders without them.
 *
 * It also exposes a complete normalizer for the InaRISK GeoJSON schema, so the
 * moment a reachable endpoint (or a self-hosted mirror of the official dataset)
 * is configured via INARISK_BASE_URL, real polygons flow into the app with no
 * further code changes.
 */

export const inariskMeta: ProviderMeta = {
	id: 'inarisk',
	name: 'InaRISK (BNPB)',
	domains: ['flood', 'landslide', 'wildfire', 'drought', 'extreme_weather'],
	url: config.providers.inarisk.baseUrl,
	attribution: 'Badan Nasional Penanggulangan Bencana (BNPB) — InaRISK',
	category: 'hazard',
	priority: 80
};

export interface InariskRawFeature {
	type: 'Feature';
	properties: {
		OBJECTID?: number;
		KABKOT?: string;
		PROVINSI?: string;
		KODE_KAB?: string;
		KODE_PROV?: string;
		CLASS?: string | number;
		SKOR?: number;
		LUAS?: number;
		JENIS?: string;
		/**
		 * InaRISK class index. 1 = very low … 4/5 = very high depending on layer.
		 * Never interpreted as a probability; only as a published classification.
		 */
		[K: string]: unknown;
	};
	geometry: GeoJSON.Geometry;
}

/** Maps InaRISK's published class index to our severity vocabulary. */
export function inariskClassToSeverity(value: string | number | undefined): DisasterEvent['severity'] {
	if (value === undefined || value === null) return 'unknown';
	const text = String(value).toLowerCase().trim();

	// Textual class labels used by several InaRISK layers.
	if (text.includes('sangat tinggi') || text.includes('very high')) return 'critical';
	if (text.includes('tinggi') || text.includes('high')) return 'high';
	if (text.includes('sedang') || text.includes('menengah') || text.includes('moderate')) return 'moderate';
	if (text.includes('rendah') || text.includes('low')) return 'low';

	// Numeric class bands (InaRISK uses 3- and 5-class schemes).
	const numeric = Number(text);
	if (!Number.isFinite(numeric)) return 'unknown';
	if (numeric >= 4) return 'critical';
	if (numeric === 3) return 'high';
	if (numeric === 2) return 'moderate';
	if (numeric === 1) return 'low';
	return 'unknown';
}

export function inariskTypeToDisasterType(jenis: string | undefined): DisasterEvent['type'] {
	const text = (jenis ?? '').toLowerCase();
	if (text.includes('banjir') && text.includes('bandang')) return 'flash_flood';
	if (text.includes('banjir')) return 'flood';
	if (text.includes('longsor')) return 'landslide';
	if (text.includes('karhutla') || text.includes('kebakaran')) return 'wildfire';
	if (text.includes('kekeringan')) return 'drought';
	if (text.includes('gelombang') || text.includes('abrasi')) return 'high_wave';
	if (text.includes('gunung')) return 'volcano';
	if (text.includes('gempa')) return 'earthquake';
	if (text.includes('tsunami')) return 'tsunami';
	if (text.includes('cuaca')) return 'extreme_weather';
	return 'other';
}

/**
 * Converts an InaRISK feature collection into hazard events.
 * Polygons are preserved as GeoJSON so the map can render fill layers.
 */
export function normalizeInarisk(
	features: InariskRawFeature[],
	retrievedAt: string
): DisasterEvent[] {
	const events: DisasterEvent[] = [];

	for (const feature of features) {
		if (!feature?.geometry || !feature.properties) continue;
		const props = feature.properties;

		const severity = inariskClassToSeverity(props.CLASS ?? props.SKOR);
		if (severity === 'unknown') continue;

		const type = inariskTypeToDisasterType(props.JENIS);
		const region = props.KABKOT ?? props.PROVINSI ?? 'Indonesia';
		const centering = centroidOf(feature.geometry);

		events.push({
			id: `inarisk:${props.OBJECTID ?? `${props.KODE_KAB ?? 'id'}-${type}-${severity}`}`,
			type,
			// A published hazard map is a static classification, never a live event.
			category: 'hazard',
			title: `Zona ${typeLabel(type)} — ${region}`,
			description: `Klasifikasi bahaya InaRISK: ${severity === 'critical' ? 'sangat tinggi' : severity}. Wilayah ${region}.`,
			severity,
			severityIsInternal: false,
			location: {
				latitude: centering.lat,
				longitude: centering.lon,
				province: props.PROVINSI ?? undefined,
				provinceCode: props.KODE_PROV ?? undefined,
				regency: props.KABKOT ?? undefined,
				regencyCode: props.KODE_KAB ?? undefined
			},
			geometry: feature.geometry,
			updatedAt: retrievedAt,
			retrievedAt,
			source: {
				name: inariskMeta.attribution,
				url: inariskMeta.url,
				priority: inariskMeta.priority,
				retrievedAt
			},
			metadata: {
				inariskClass: props.CLASS ?? null,
				inariskScore: props.SKOR ?? null,
				areaHa: props.LUAS ?? null,
				nature: 'hazard_map'
			}
		});
	}

	return events;
}

function typeLabel(type: DisasterEvent['type']): string {
	const labels: Partial<Record<DisasterEvent['type'], string>> = {
		flood: 'rawan banjir',
		flash_flood: 'rawan banjir bandang',
		landslide: 'rawan longsor',
		wildfire: 'rawan karhutla',
		drought: 'rawan kekeringan',
		high_wave: 'rawan gelombang tinggi',
		extreme_weather: 'rawan cuaca ekstrem',
		volcano: 'rawan gunung api',
		earthquake: 'rawan gempa',
		tsunami: 'rawan tsunami'
	};
	return labels[type] ?? 'bahaya';
}

/** Rough centroid used only to place a start marker for polygon layers. */
function centroidOf(geometry: GeoJSON.Geometry): { lat: number; lon: number } {
	const coords: number[][] = [];
	const collect = (value: unknown): void => {
		if (!Array.isArray(value)) return;
		if (typeof value[0] === 'number' && typeof value[1] === 'number') {
			coords.push([value[0] as number, value[1] as number]);
			return;
		}
		for (const child of value) collect(child);
	};
	if ('coordinates' in geometry) collect(geometry.coordinates);

	if (coords.length === 0) return { lat: 0, lon: 0 };
	const sum = coords.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]);
	return { lon: sum[0] / coords.length, lat: sum[1] / coords.length };
}

/**
 * Probes InaRISK availability with a real request.
 * A failure here is expected in most environments and is reported honestly.
 */
export async function probeInarisk(): Promise<{
	reachable: boolean;
	status?: number;
	error?: string;
	durationMs: number;
}> {
	const started = Date.now();
	try {
		// Use a HEAD-like GET against the configured base; we only care whether
		// the origin is reachable at all.
		const result = await fetchJson<unknown>(config.providers.inarisk.baseUrl, {
			timeoutMs: config.providers.inarisk.timeoutMs,
			retries: 0,
			parse: 'none',
			accept: 'text/html'
		});
		return { reachable: true, status: result.status, durationMs: Date.now() - started };
	} catch (error) {
		return {
			reachable: false,
			error: error instanceof Error ? error.message : String(error),
			durationMs: Date.now() - started
		};
	}
}

export const inariskProvider: DataProvider<InariskRawFeature[], DisasterEvent[]> = {
	meta: inariskMeta,
	async fetch(signal) {
		const started = Date.now();
		const result = await fetchJson<{ features?: InariskRawFeature[] }>(
			`${config.providers.inarisk.baseUrl}/api/hazard`,
			{
				timeoutMs: config.providers.inarisk.timeoutMs,
				retries: 0
			}
		);
		void signal; // reserved for future cancellation support
		logger.info('inarisk fetch ok', { provider: 'inarisk', durationMs: Date.now() - started });
		return {
			data: result.data.features ?? [],
			status: result.status,
			durationMs: Date.now() - started,
			retrievedAt: new Date().toISOString()
		};
	},
	normalize(raw, retrievedAt) {
		return normalizeInarisk(raw, retrievedAt);
	}
};
