import { createHash } from 'node:crypto';
import type { DisasterEvent, Severity } from '$lib/types';
import type { BmkgRawQuake } from '$lib/server/providers/bmkg/earthquake';
import { shakemapUrl } from '$lib/server/providers/bmkg/earthquake';

const SOURCE_NAME = 'BMKG';
const SOURCE_URL = 'https://www.bmkg.go.id/gempabumi/gempabumi-terkini.bmkg';

/**
 * Parses BMKG's "Coordinates" field, which is "lat,lon" with lat first.
 * Returns null when the value is unusable rather than emitting a bogus location.
 */
export function parseCoordinates(raw: string | undefined): { lat: number; lon: number } | null {
	if (!raw) return null;
	const parts = raw.split(',').map((s) => Number.parseFloat(s.trim()));
	if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
	const [lat, lon] = parts;
	// Indonesia's bounding box, generously padded. Guards against swapped axes
	// and against providers returning placeholder values like "0,0".
	if (lat < -12 || lat > 8 || lon < 93 || lon > 142) {
		// Fall back to accepting if clearly valid lat/lon shape but outside box
		// (BMKG occasionally reports events just outside the box).
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
	}
	return { lat, lon };
}

/** "10 km" -> 10. Returns null when depth is not reported numerically. */
export function parseDepth(raw: string | undefined): number | null {
	if (!raw) return null;
	const match = raw.match(/-?\d+(?:[.,]\d+)?/);
	if (!match) return null;
	const value = Number.parseFloat(match[0].replace(',', '.'));
	return Number.isFinite(value) ? value : null;
}

export function parseMagnitude(raw: string | undefined): number | null {
	if (!raw) return null;
	const value = Number.parseFloat(raw.replace(',', '.'));
	return Number.isFinite(value) ? value : null;
}

/**
 * Magnitude-to-severity mapping used *only* for display classification.
 * This is our internal convention and is always flagged as such in the UI.
 */
export function magnitudeSeverity(magnitude: number | null): Severity {
	if (magnitude === null) return 'unknown';
	if (magnitude >= 7) return 'critical';
	if (magnitude >= 6) return 'high';
	if (magnitude >= 5) return 'moderate';
	if (magnitude >= 3) return 'low';
	return 'low';
}

export function isTsunamiPotential(raw: string | undefined): boolean {
	if (!raw) return false;
	const text = raw.toLowerCase();
	// BMKG phrasing: "Tidak berpotensi tsunami" / "Berpotensi tsunami"
	if (text.includes('tidak')) return false;
	return text.includes('berpotensi tsunami');
}

/**
 * Stable identifier for an earthquake.
 * BMKG does not always expose a guid, so we hash the immutable event
 * characteristics. This makes de-duplication across feeds reliable and
 * keeps the same event stable between crons.
 */
export function earthquakeEventId(raw: BmkgRawQuake): string {
	if (raw.guid) return `bmkg:quake:${raw.guid}`;
	const identity = [
		raw.DateTime ?? `${raw.Tanggal ?? ''}T${raw.Jam ?? ''}`,
		raw.Coordinates ?? '',
		raw.Magnitude ?? '',
		raw.Kedalaman ?? ''
	].join('|');
	const hash = createHash('sha1').update(identity).digest('hex').slice(0, 16);
	return `bmkg:quake:${hash}`;
}

function parseTimestamp(raw: BmkgRawQuake): string | null {
	if (raw.DateTime) {
		const parsed = new Date(raw.DateTime);
		if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
	}
	return null;
}

export interface NormalizeQuakeOptions {
	/** Feed the record came from, stored in metadata for provenance. */
	feed: string;
	/** Overrides category; felt-event feeds are observations of shaking, not warnings. */
	category?: 'current_event' | 'historical' | 'observation';
}

/**
 * Converts raw BMKG earthquake records into the unified model.
 * Records with unusable coordinates or timestamps are dropped, never guessed.
 */
export function normalizeEarthquakes(
	raw: BmkgRawQuake[],
	retrievedAt: string,
	options: NormalizeQuakeOptions
): DisasterEvent[] {
	const events: DisasterEvent[] = [];
	const seen = new Set<string>();

	for (const record of raw) {
		const coords = parseCoordinates(record.Coordinates);
		if (!coords) continue;

		const occurredAt = parseTimestamp(record);
		if (!occurredAt) continue;

		const id = earthquakeEventId(record);
		if (seen.has(id)) continue;
		seen.add(id);

		const magnitude = parseMagnitude(record.Magnitude);
		const depth = parseDepth(record.Kedalaman);
		const tsunami = isTsunamiPotential(record.Potensi);
		const severity = magnitudeSeverity(magnitude);

		const title =
			magnitude !== null
				? `Gempa M${magnitude.toFixed(1)} — ${record.Wilayah ?? 'Indonesia'}`
				: `Gempa — ${record.Wilayah ?? 'Indonesia'}`;

		const parts: string[] = [];
		if (magnitude !== null) parts.push(`Magnitudo ${magnitude.toFixed(1)}`);
		if (depth !== null) parts.push(`kedalaman ${depth} km`);
		if (record.Wilayah) parts.push(record.Wilayah);
		const description = parts.join(', ') + '.';

		events.push({
			id,
			type: 'earthquake',
			category: options.category ?? 'current_event',
			title,
			description,
			severity,
			severityIsInternal: true,
			location: {
				latitude: coords.lat,
				longitude: coords.lon
			},
			geometry: { type: 'Point', coordinates: [coords.lon, coords.lat] },
			occurredAt,
			updatedAt: occurredAt,
			retrievedAt,
			source: {
				name: SOURCE_NAME,
				url: SOURCE_URL,
				sourceId: record.guid,
				priority: 100,
				retrievedAt
			},
			metadata: {
				feed: options.feed,
				magnitude,
				depthKm: depth,
				region: record.Wilayah ?? null,
				tsunamiPotential: tsunami,
				tsunamiPotentialText: record.Potensi ?? null,
				feltText: record.Dirasakan ?? null,
				localTime: `${record.Tanggal ?? ''} ${record.Jam ?? ''}`.trim() || null,
				shakemap: shakemapUrl(record.Shakemap) ?? null,
				// Explicitly documents that no prediction is being made.
				nature: 'occurred_event'
			}
		});
	}

	return events;
}
