import { seasonalFactor } from '$lib/server/risk/engine';

/**
 * Seasonal context.
 *
 * Indonesia's season cycle is described here as a coarse climatological phase
 * derived from the calendar month and the documented BMKG monsoon pattern
 * (roughly November–March wet, June–September dry, with pancaroba transitions).
 *
 * This is deliberately NOT a per-region seasonal forecast: BMKG publishes
 * per-region "Prakiraan Awal Musim" products that we do not ingest. We therefore
 * present only the national phase context and state its granularity plainly,
 * rather than implying region-level precision we cannot support.
 */

export type SeasonPhase = 'hujan' | 'kemarau' | 'pancaroba';

export interface SeasonContext {
	month: number;
	year: number;
	phase: SeasonPhase;
	phaseLabel: string;
	/** Coarse 0–1 wetness weighting, reused by the risk engine. */
	factor: number;
	explanation: string;
	/** Months that share this phase, for orientation. */
	typicalMonths: string;
	notes: string[];
	updatedAt: string;
}

const PHASE_BY_MONTH: Record<number, { phase: SeasonPhase; typicalMonths: string }> = {
	12: { phase: 'hujan', typicalMonths: 'Desember–Februari' },
	1: { phase: 'hujan', typicalMonths: 'Desember–Februari' },
	2: { phase: 'hujan', typicalMonths: 'Desember–Februari' },
	11: { phase: 'pancaroba', typicalMonths: 'November & Maret' },
	3: { phase: 'pancaroba', typicalMonths: 'November & Maret' },
	6: { phase: 'kemarau', typicalMonths: 'Juni–September' },
	7: { phase: 'kemarau', typicalMonths: 'Juni–September' },
	8: { phase: 'kemarau', typicalMonths: 'Juni–September' },
	9: { phase: 'kemarau', typicalMonths: 'Juni–September' }
};

const PHASE_LABELS: Record<SeasonPhase, string> = {
	hujan: 'Musim Hujan',
	kemarau: 'Musim Kemarau',
	pancaroba: 'Masa Pancaroba (Peralihan)'
};

/** Computes the current national seasonal context. Deterministic. */
export function getSeasonContext(now: Date = new Date()): SeasonContext {
	const month = now.getMonth() + 1;
	const { phase, typicalMonths } = PHASE_BY_MONTH[month] ?? {
		phase: 'pancaroba' as SeasonPhase,
		typicalMonths: 'April–Mei & Oktober'
	};
	const factor = seasonalFactor(month);

	const notes: string[] = [
		'Fase musim ini bersifat nasional dan kasar (berbasis bulan), bukan prakiraan awal musim per wilayah.',
		'BMKG menerbitkan prakiraan awal musim per zona; rujuk situs resmi BMKG untuk detail wilayah Anda.',
		'Pada musim hujan, risiko banjir dan tanah longsor meningkat. Pada musim kemarau, risiko karhutla dan kekeringan meningkat.'
	];

	if (phase === 'pancaroba') {
		notes.push(
			'Pancaroba sering ditandai cuaca yang cepat berubah; perhatikan peringatan dini cuaca BMKG.'
		);
	}

	return {
		month,
		year: now.getFullYear(),
		phase,
		phaseLabel: PHASE_LABELS[phase],
		factor: factor.value,
		explanation: factor.reason,
		typicalMonths,
		notes,
		updatedAt: now.toISOString()
	};
}
