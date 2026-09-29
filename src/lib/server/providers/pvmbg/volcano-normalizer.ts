import type { DisasterEvent, Severity } from '$lib/types';
import type { VolcanoLevel, VolcanoRaw } from '$lib/server/providers/pvmbg/volcano';
import { LEVEL_LABELS } from '$lib/server/providers/pvmbg/volcano';
import { lookupVolcanoReference } from '$lib/server/providers/pvmbg/volcano-reference';

const SOURCE_NAME = 'PVMBG / MAGMA Indonesia';
const SOURCE_URL = 'https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas';

/**
 * PVMBG activity levels ARE the official severity scale, so we map them 1:1
 * and never mark the result as internally derived.
 */
export const LEVEL_SEVERITY: Record<VolcanoLevel, Severity> = {
	I: 'low',
	II: 'moderate',
	III: 'high',
	IV: 'critical'
};

export const LEVEL_LABEL_ID: Record<VolcanoLevel, string> = {
	I: 'Normal',
	II: 'Waspada',
	III: 'Siaga',
	IV: 'Awas'
};

export interface NormalizedVolcano extends DisasterEvent {
	metadata: {
		volcanoName: string;
		level: VolcanoLevel;
		levelLabel: string;
		levelName: string;
		region: string | null;
		elevationM: number | null;
		province: string | null;
		coordinatesKnown: boolean;
		recommendation: string | null;
		reportUrl: string | null;
		nature: 'volcanic_activity_level';
	} & Record<string, unknown>;
}

export function volcanoEventId(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
	return `pvmbg:volcano:${slug}`;
}

/**
 * Normalizes MAGMA's activity levels into the unified model.
 *
 * Volcanoes without a known coordinate are still returned (so the list and
 * warnings are complete) but flagged `coordinatesKnown: false` and given a
 * placeholder location that the map layer filters out. We never invent a
 * coordinate for a volcano.
 */
export function normalizeVolcanoes(raw: VolcanoRaw[], retrievedAt: string): NormalizedVolcano[] {
	return raw.map((volcano) => {
		const reference = lookupVolcanoReference(volcano.name);
		const severity = LEVEL_SEVERITY[volcano.level];
		const levelName = LEVEL_LABEL_ID[volcano.level];

		// Placeholder 0,0 keeps the required shape; filtered by coordinatesKnown.
		const latitude = reference?.latitude ?? 0;
		const longitude = reference?.longitude ?? 0;
		const coordinatesKnown = reference !== null;

		const description = [
			`Status resmi PVMBG: ${LEVEL_LABELS[volcano.level]}.`,
			volcano.region ? `Wilayah administrasi: ${volcano.region}.` : null,
			reference ? `Ketinggian ${reference.elevationM.toLocaleString('id-ID')} mdpl.` : null
		]
			.filter(Boolean)
			.join(' ');

		return {
			id: volcanoEventId(volcano.name),
			type: 'volcano' as const,
			// An activity LEVEL is hazard status, not a specific dated event.
			category: 'hazard' as const,
			title: `Gunung ${volcano.name} — ${LEVEL_LABELS[volcano.level]}`,
			description,
			severity,
			severityIsInternal: false,
			location: {
				latitude,
				longitude,
				regency: undefined,
				province: reference?.province ?? volcano.region ?? undefined
			},
			geometry: coordinatesKnown
				? { type: 'Point' as const, coordinates: [longitude, latitude] }
				: undefined,
			// Activity levels are continuous state; we only know when we observed it.
			updatedAt: retrievedAt,
			retrievedAt,
			source: {
				name: SOURCE_NAME,
				url: volcano.reportUrl ?? SOURCE_URL,
				priority: 100,
				retrievedAt
			},
			metadata: {
				volcanoName: volcano.name,
				level: volcano.level,
				levelLabel: volcano.levelLabel,
				levelName,
				region: volcano.region || null,
				elevationM: reference?.elevationM ?? null,
				province: reference?.province ?? volcano.region ?? null,
				coordinatesKnown,
				recommendation: volcano.recommendation ?? null,
				reportUrl: volcano.reportUrl ?? null,
				nature: 'volcanic_activity_level'
			}
		};
	});
}
