/**
 * MapLibre layer configuration and GeoJSON assembly.
 *
 * Kept separate from the Svelte component so the styling rules are unit-testable
 * and so the map's data shape has a single definition.
 *
 * Design rules encoded here:
 *  - Severity colour comes from SEVERITY_TOKENS so the map and the UI agree.
 *  - Category is expressed via marker/outline so a forecast never looks like a
 *    warning.
 *  - Events with no real coordinates are excluded, never plotted at (0,0).
 */
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { DisasterEvent } from '$lib/types';
import { SEVERITY_TOKENS, DISASTER_TYPE_TOKENS } from '$lib/utils/severity';

export interface EventFeatureProperties {
	id: string;
	type: string;
	typeLabel: string;
	/**
	 * Short label rendered next to the marker. Uses the specific name where the
	 * event has one (e.g. "Gunung Merapi") rather than the generic type label,
	 * so volcanoes are not all labelled "Gunung Api".
	 */
	label: string;
	category: string;
	severity: string;
	title: string;
	source: string;
	when: string;
	/** Pre-formatted facts for the popup, avoiding formatting work in the map. */
	facts: string;
	magnitude?: number | null;
	level?: string | null;
	hasGeometry: boolean;
}

export type EventFeature = Feature<Geometry, EventFeatureProperties>;

/**
 * Builds a FeatureCollection from events.
 *
 * Points are emitted for events with coordinates. Events carrying a real
 * polygon/multipolygon geometry (BMKG CAP warning areas, InaRISK zones) are
 * emitted as area features so warning extents render truthfully.
 */
export function eventsToFeatureCollection(
	events: DisasterEvent[]
): FeatureCollection<Geometry, EventFeatureProperties> {
	const features: EventFeature[] = [];

	for (const event of events) {
		const properties = toProperties(event);

		// Prefer the authoritative geometry (true areal extent) when present.
		if (event.geometry && event.geometry.type !== 'Point') {
			features.push({ type: 'Feature', geometry: event.geometry, properties });
			continue;
		}

		const { latitude, longitude } = event.location;
		const hasCoords =
			Number.isFinite(latitude) &&
			Number.isFinite(longitude) &&
			!(latitude === 0 && longitude === 0);

		if (!hasCoords) continue;

		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [longitude, latitude] },
			properties
		});
	}

	return { type: 'FeatureCollection', features };
}

function toProperties(event: DisasterEvent): EventFeatureProperties {
	const typeToken = DISASTER_TYPE_TOKENS[event.type] ?? DISASTER_TYPE_TOKENS.other;
	const magnitude = Number(event.metadata?.magnitude);

	const facts: string[] = [];
	if (event.type === 'earthquake') {
		if (Number.isFinite(magnitude)) facts.push(`M ${magnitude.toFixed(1).replace('.', ',')}`);
		const depth = Number(event.metadata?.depthKm);
		if (Number.isFinite(depth)) facts.push(`kedalaman ${depth} km`);
		if (event.metadata?.tsunamiPotential === true) facts.push('potensi tsunami');
	}
	if (event.type === 'volcano') {
		const level = event.metadata?.level;
		if (level) facts.push(`Level ${level}`);
	}

	// Prefer the specific entity name (volcano) over the generic type label so
	// the map does not label every volcano with the same "Gunung Api" text.
	const specificName =
		event.type === 'volcano' ? String(event.metadata?.volcanoName ?? '').trim() : '';
	const label = specificName ? `Gunung ${specificName}` : typeToken.label;

	return {
		id: event.id,
		type: event.type,
		typeLabel: typeToken.label,
		label,
		category: event.category,
		severity: event.severity,
		title: event.title,
		source: event.source.name,
		when: event.occurredAt ?? event.validFrom ?? event.updatedAt,
		facts: facts.join(' · '),
		magnitude: Number.isFinite(magnitude) ? magnitude : null,
		level: (event.metadata?.level as string | undefined) ?? null,
		hasGeometry: true
	};
}

/* ------------------------------------------------------------------ */
/* Layer definitions                                                   */
/* ------------------------------------------------------------------ */

/**
 * Circle radius for clustered points, by severity.
 * Expressed as a MapLibre expression so it reacts to filters without re-adding
 * the layer.
 */
export function severityRadiusExpression(): unknown {
	const steps: unknown[] = ['match', ['get', 'severity']];
	for (const [key, token] of Object.entries(SEVERITY_TOKENS)) {
		steps.push(key, key === 'critical' ? 9 : key === 'high' ? 7.5 : key === 'moderate' ? 6 : 5);
		void token;
	}
	steps.push(5);
	return steps;
}

export function severityColorExpression(): unknown {
	const expression: unknown[] = ['match', ['get', 'severity']];
	for (const [key, token] of Object.entries(SEVERITY_TOKENS)) {
		expression.push(key, token.hex);
	}
	expression.push(SEVERITY_TOKENS.unknown.hex);
	return expression;
}

/**
 * Warning polygons get a coloured fill with a strong outline; hazard/risk
 * polygons get a hatched-style low-opacity fill so they are never confused with
 * an active warning area.
 */
export const AREA_PAINT = {
	'warning-fill': {
		'fill-color': severityColorExpression(),
		'fill-opacity': ['match', ['get', 'category'], 'early_warning', 0.18, 0.08]
	},
	'warning-outline': {
		'line-color': severityColorExpression(),
		'line-width': ['match', ['get', 'category'], 'early_warning', 2, 'current_event', 1.5, 0.75],
		'line-opacity': 0.9
	}
} as const;

/** Stable layer/source ids, referenced by the component and tests. */
export const MAP_IDS = {
	pointSource: 'events-points',
	clusterSource: 'events-clusters',
	areaSource: 'events-areas',
	clusters: 'events-cluster-layer',
	clusterCount: 'events-cluster-count',
	points: 'events-point-layer',
	pointLabels: 'events-point-labels',
	areaFill: 'events-area-fill',
	areaOutline: 'events-area-outline'
} as const;

export const INDONESIA_CENTER: [number, number] = [118.0, -2.5];
export const INDONESIA_ZOOM = 4.2;
