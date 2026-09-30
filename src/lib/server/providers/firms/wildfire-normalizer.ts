import { createHash } from 'node:crypto';
import type { DisasterEvent, Severity } from '$lib/types';
import type { FirmsHotspot } from '$lib/server/providers/firms/wildfire';
import { nearestRegion } from '$lib/utils/regions';

const SOURCE_NAME = 'NASA FIRMS';
const SOURCE_URL = 'https://firms.modaps.eosdis.nasa.gov/';

/**
 * Indonesia's bounding box. Detections outside it are dropped: FIRMS' area API
 * is a rectangle, so a padded box can include neighbouring land.
 */
const BBOX = { minLat: -12, maxLat: 8, minLon: 94, maxLon: 142 };

/**
 * Converts *confidence* to our internal severity scale.
 *
 * This is OUR classification, never NASA's: FIRMS reports detection confidence
 * (a low/medium/high band, or a percentage for some products), not a hazard
 * severity. It is always flagged `severityIsInternal` so the UI does not imply
 * the satellite graded the fire. A hotspot is a detection, not a confirmed fire.
 */
export function confidenceSeverity(confidence: string | null): Severity {
	if (!confidence) return 'unknown';
	const normalized = confidence.trim().toLowerCase();

	// Numeric percentage (some VIIRS products report 0–100).
	const numeric = Number.parseFloat(normalized.replace('%', ''));
	if (Number.isFinite(numeric)) {
		if (numeric >= 80) return 'high';
		if (numeric >= 50) return 'moderate';
		return 'low';
	}

	if (normalized.startsWith('h')) return 'high';
	if (normalized.startsWith('n')) return 'moderate'; // "nominal"
	if (normalized.startsWith('l')) return 'low';
	return 'unknown';
}

/** Builds an ISO timestamp from FIRMS' separate date and time fields (UTC). */
export function hotspotTimestamp(acqDate: string | null, acqTime: string | null): string | null {
	if (!acqDate) return null;
	const dateMatch = acqDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!dateMatch) return null;

	// acq_time is "HHMM" (may be zero-padded to 4 digits), or absent.
	let hours = 0;
	let minutes = 0;
	if (acqTime) {
		const digits = acqTime.replace(/\D/g, '').padStart(4, '0').slice(0, 4);
		hours = Number.parseInt(digits.slice(0, 2), 10);
		minutes = Number.parseInt(digits.slice(2, 4), 10);
		if (!Number.isFinite(hours) || hours > 23) hours = 0;
		if (!Number.isFinite(minutes) || minutes > 59) minutes = 0;
	}

	const iso = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`;
	const parsed = new Date(iso);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Stable id for a detection.
 *
 * FIRMS has no primary key, so identity is the satellite + instrument + exact
 * time + position. Two detections at the same place and minute from the same
 * instrument are the same detection; anything else is distinct.
 */
export function hotspotEventId(hotspot: FirmsHotspot): string {
	const identity = [
		hotspot.satellite ?? '',
		hotspot.instrument ?? '',
		hotspot.acqDate ?? '',
		hotspot.acqTime ?? '',
		hotspot.latitude.toFixed(4),
		hotspot.longitude.toFixed(4)
	].join('|');
	const hash = createHash('sha1').update(identity).digest('hex').slice(0, 16);
	return `firms:hotspot:${hash}`;
}

/**
 * Maximum hotspots emitted from a single sync.
 *
 * FIRMS can return thousands of detections for Indonesia during a dry-season
 * peak. Emitting them all would swamp the map and crowd genuinely urgent events
 * out of the bounded event list, so we keep the most recent detections. This cap
 * is disclosed in the event metadata (`truncated`), never hidden.
 */
export const MAX_HOTSPOTS = 300;

/**
 * Normalizes raw hotspots into the unified model.
 *
 * These events are `observation`, never `current_event`: a thermal anomaly is a
 * satellite detection, not a confirmed fire. Coordinates outside Indonesia's
 * box are dropped rather than plotted.
 */
export function normalizeHotspots(hotspots: FirmsHotspot[], retrievedAt: string): DisasterEvent[] {
	const events: DisasterEvent[] = [];
	const seen = new Set<string>();

	for (const hotspot of hotspots) {
		if (
			hotspot.latitude < BBOX.minLat ||
			hotspot.latitude > BBOX.maxLat ||
			hotspot.longitude < BBOX.minLon ||
			hotspot.longitude > BBOX.maxLon
		) {
			continue;
		}

		const id = hotspotEventId(hotspot);
		if (seen.has(id)) continue;
		seen.add(id);

		const occurredAt = hotspotTimestamp(hotspot.acqDate, hotspot.acqTime);
		const severity = confidenceSeverity(hotspot.confidence);

		// Best-effort administrative label: the nearest bundled regency. This is
		// a reference point, not a claim that the detection falls inside that
		// boundary — the title/description make the hotspot nature explicit.
		const region = nearestRegion(hotspot.latitude, hotspot.longitude);
		const areaName = region ? region.regency.name : null;

		const coords = `${hotspot.latitude.toFixed(3)}, ${hotspot.longitude.toFixed(3)}`;
		const title = areaName
			? `Titik Panas (Hotspot) — ${areaName}`
			: `Titik Panas (Hotspot) — ${coords}`;

		const parts: string[] = ['Deteksi anomali termal satelit. Bukan kebakaran yang terkonfirmasi.'];
		if (areaName) parts.push(`Area terdekat: ${areaName}, ${region!.province.name}`);
		else parts.push(`Koordinat ${coords}`);
		if (hotspot.satellite) parts.push(`Satelit ${hotspot.satellite}`);
		if (hotspot.instrument) parts.push(`instrumen ${hotspot.instrument}`);
		if (hotspot.confidence) parts.push(`kepercayaan deteksi ${hotspot.confidence}`);
		if (hotspot.frp !== null) parts.push(`FRP ${hotspot.frp} MW`);
		const description = parts.join(' · ') + '.';

		events.push({
			id,
			type: 'wildfire',
			// Observation, not a current event: this is a detection, not a report
			// of an ongoing, confirmed fire.
			category: 'observation',
			title,
			description,
			severity,
			severityIsInternal: true,
			location: {
				latitude: hotspot.latitude,
				longitude: hotspot.longitude,
				regency: region?.regency.name,
				regencyCode: region?.regency.code,
				province: region?.province.name,
				provinceCode: region?.province.code
			},
			geometry: {
				type: 'Point',
				coordinates: [hotspot.longitude, hotspot.latitude]
			},
			occurredAt: occurredAt ?? undefined,
			updatedAt: occurredAt ?? retrievedAt,
			retrievedAt,
			source: {
				name: SOURCE_NAME,
				url: SOURCE_URL,
				priority: 70,
				retrievedAt
			},
			metadata: {
				kind: 'thermal_anomaly',
				areaName,
				satellite: hotspot.satellite,
				instrument: hotspot.instrument,
				confidence: hotspot.confidence,
				brightnessK: hotspot.brightness,
				frpMw: hotspot.frp,
				daynight: hotspot.daynight,
				acqDate: hotspot.acqDate,
				acqTime: hotspot.acqTime,
				// Documents that this is a satellite detection, not a confirmed fire
				// and not a prediction of any kind.
				nature: 'satellite_detection',
				disclaimer:
					'Titik panas adalah deteksi anomali termal satelit (NASA FIRMS), bukan kebakaran yang terkonfirmasi. Verifikasi dengan sumber resmi (KLHK/Sipongi, BPBD setempat).'
			}
		});
	}

	if (events.length <= MAX_HOTSPOTS) return events;

	// Keep the most recent detections. Events without a timestamp sort last.
	events.sort((a, b) => {
		const at = a.occurredAt ? Date.parse(a.occurredAt) : 0;
		const bt = b.occurredAt ? Date.parse(b.occurredAt) : 0;
		return bt - at;
	});

	const kept = events.slice(0, MAX_HOTSPOTS);
	for (const event of kept) {
		if (event.metadata) {
			event.metadata.truncated = true;
			event.metadata.totalDetections = events.length;
		}
	}
	return kept;
}
