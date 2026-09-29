import { createHash } from 'node:crypto';
import type { DisasterEvent, Severity } from '$lib/types';
import type { CapAlert } from '$lib/server/providers/bmkg/warning';
import { capPolygonsToMultiPolygon } from '$lib/server/providers/bmkg/warning';

const SOURCE_NAME = 'BMKG';
const SOURCE_URL = 'https://www.bmkg.go.id/alerts/nowcast/id/rss.xml';

/**
 * CAP's official severity vocabulary maps directly onto ours.
 * Because this is BMKG's own published classification, we never mark it internal.
 */
export function capSeverityToSeverity(cap: string | null | undefined): Severity {
	switch ((cap ?? '').toLowerCase()) {
		case 'extreme':
			return 'critical';
		case 'severe':
			return 'high';
		case 'moderate':
			return 'moderate';
		case 'minor':
			return 'low';
		default:
			return 'unknown';
	}
}

/** Maps free-text BMKG event names to our disaster taxonomy. */
export function eventNameToDisasterType(event: string | null | undefined): DisasterEvent['type'] {
	const text = (event ?? '').toLowerCase();
	if (text.includes('banjir bandang')) return 'flash_flood';
	if (text.includes('banjir')) return 'flood';
	if (text.includes('longsor')) return 'landslide';
	if (text.includes('karhutla') || text.includes('kebakaran')) return 'wildfire';
	if (text.includes('kekeringan')) return 'drought';
	if (text.includes('gelombang') || text.includes('angin laut')) return 'high_wave';
	if (text.includes('puting beliung')) return 'tornado';
	if (text.includes('tsunami')) return 'tsunami';
	if (
		text.includes('hujan') ||
		text.includes('petir') ||
		text.includes('angin') ||
		text.includes('cuaca')
	) {
		return 'extreme_weather';
	}
	return 'extreme_weather';
}

export function warningEventId(alert: CapAlert): string {
	if (alert.identifier) {
		return `bmkg:warning:${createHash('sha1').update(alert.identifier).digest('hex').slice(0, 16)}`;
	}
	const identity = `${alert.headline ?? ''}|${alert.effective ?? ''}|${alert.areaDesc ?? ''}`;
	return `bmkg:warning:${createHash('sha1').update(identity).digest('hex').slice(0, 16)}`;
}

/** Rough centroid of a CAP MultiPolygon, used to place the map marker. */
function geometryCentroid(
	geometry: GeoJSON.MultiPolygon | null
): { lat: number; lon: number } | null {
	if (!geometry || geometry.coordinates.length === 0) return null;
	const points: number[][] = [];
	for (const polygon of geometry.coordinates) {
		for (const ring of polygon) points.push(...ring);
	}
	if (points.length === 0) return null;
	const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
	return { lon: sum[0] / points.length, lat: sum[1] / points.length };
}

/** Province name inferred from BMKG's area description, when present. */
export function inferProvince(areaDesc: string | null | undefined): string | undefined {
	if (!areaDesc) return undefined;
	const provinces = [
		'Aceh',
		'Sumatera Utara',
		'Sumatera Barat',
		'Riau',
		'Kepulauan Riau',
		'Jambi',
		'Bengkulu',
		'Sumatera Selatan',
		'Kepulauan Bangka Belitung',
		'Lampung',
		'Banten',
		'DKI Jakarta',
		'Jawa Barat',
		'Jawa Tengah',
		'DI Yogyakarta',
		'Daerah Istimewa Yogyakarta',
		'Jawa Timur',
		'Bali',
		'Nusa Tenggara Barat',
		'Nusa Tenggara Timur',
		'Kalimantan Barat',
		'Kalimantan Tengah',
		'Kalimantan Selatan',
		'Kalimantan Timur',
		'Kalimantan Utara',
		'Sulawesi Utara',
		'Gorontalo',
		'Sulawesi Tengah',
		'Sulawesi Barat',
		'Sulawesi Selatan',
		'Sulawesi Tenggara',
		'Maluku',
		'Maluku Utara',
		'Papua Barat',
		'Papua',
		'Papua Selatan',
		'Papua Tengah',
		'Papua Pegunungan',
		'Papua Barat Daya'
	];
	const lower = areaDesc.toLowerCase();
	return provinces.find((province) => lower.includes(province.toLowerCase()));
}

/**
 * Converts CAP alerts into the unified model.
 *
 * Expired alerts are dropped: a warning that ended is not an active warning,
 * and presenting it as one would be actively dangerous.
 */
export function normalizeWarnings(
	alerts: CapAlert[],
	retrievedAt: string,
	options: { includeExpired?: boolean } = {}
): DisasterEvent[] {
	const { includeExpired = false } = options;
	const now = Date.now();
	const events: DisasterEvent[] = [];
	const seen = new Set<string>();

	for (const alert of alerts) {
		const id = warningEventId(alert);
		if (seen.has(id)) continue;
		seen.add(id);

		const expiresAt = alert.expires ? new Date(alert.expires).getTime() : null;
		if (!includeExpired && expiresAt !== null && expiresAt < now) continue;

		const geometry = capPolygonsToMultiPolygon(alert.polygons);
		const centroid = geometryCentroid(geometry);
		const province = inferProvince(alert.areaDesc);

		const severity = capSeverityToSeverity(alert.severity);

		events.push({
			id,
			type: eventNameToDisasterType(alert.event),
			// A CAP alert with msgType=Alert is by definition an early warning.
			category: 'early_warning',
			title: alert.headline ?? alert.event ?? 'Peringatan dini cuaca',
			description: alert.description ?? undefined,
			severity,
			severityIsInternal: false,
			location: {
				latitude: centroid?.lat ?? 0,
				longitude: centroid?.lon ?? 0,
				province
			},
			geometry: geometry ?? undefined,
			validFrom: alert.effective ?? undefined,
			validUntil: alert.expires ?? undefined,
			occurredAt: undefined,
			updatedAt: alert.sent ?? retrievedAt,
			retrievedAt,
			source: {
				name: SOURCE_NAME,
				url: alert.sourceUrl,
				sourceId: alert.identifier,
				priority: 100,
				retrievedAt
			},
			metadata: {
				// CAP vocabulary is preserved verbatim so users can verify it upstream.
				cap: {
					identifier: alert.identifier,
					event: alert.event,
					urgency: alert.urgency,
					severity: alert.severity,
					certainty: alert.certainty,
					status: alert.status,
					msgType: alert.msgType,
					sender: alert.sender,
					sent: alert.sent,
					effective: alert.effective,
					expires: alert.expires,
					contact: alert.contact
				},
				areaDescription: alert.areaDesc,
				instruction: alert.instruction,
				infographic: alert.web,
				polygonCount: alert.polygons.length,
				nature: 'official_early_warning'
			}
		});
	}

	return events;
}

export { SOURCE_NAME as WARNING_SOURCE_NAME, SOURCE_URL as WARNING_SOURCE_URL };
