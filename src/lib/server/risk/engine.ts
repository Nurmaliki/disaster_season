import type { DisasterEvent, RiskAssessment, RiskFactor } from '$lib/types';
import { eventTimestamp } from '$lib/server/services/merge';
import { RISK_DISCLAIMER, RISK_LEVEL_BANDS } from '$lib/utils/risk';
import { haversineKm } from '$lib/utils/geo';

/**
 * Risk Engine — transparent and fully configurable.
 *
 * CRITICAL: this score is an INTERNAL INDICATOR produced by this application
 * from the data it can access. It is NOT, and must never be presented as, an
 * official government warning. Every assessment carries the disclaimer below,
 * which the UI is required to render.
 *
 * The algorithm is deliberately simple and inspectable:
 *
 *   score = clamp( round( Σ (normalizedFactor × weight) × 100 ), 0, 100 )
 *
 * Weights are declared in RISK_WEIGHTS and can be overridden per deployment via
 * environment variables without touching the algorithm.
 */

export { RISK_DISCLAIMER, RISK_LEVEL_BANDS };

/**
 * Factor weights. Each factor is normalized to 0..1 before weighting, so the
 * weights represent relative importance only. They sum to 1.0 by design, which
 * makes the final score directly interpretable as a 0..100 percentage.
 */
export const RISK_WEIGHTS = {
	/** Active official warnings affecting the area. Strongest signal available. */
	officialWarning: 0.35,
	/** Recent occurred events in the vicinity. */
	recentEvents: 0.2,
	/** Volcano activity level for nearby volcanoes. */
	volcanoActivity: 0.15,
	/** Seasonal context (rainy season raises flood/landslide risk). */
	seasonalContext: 0.15,
	/** Published hazard/risk classification from InaRISK when available. */
	hazardExposure: 0.1,
	/** Weather forecast severity from BMKG. */
	weatherForecast: 0.05
} as const;

export type RiskFactorKey = keyof typeof RISK_WEIGHTS;

const SEVERITY_TO_VALUE: Record<DisasterEvent['severity'], number> = {
	critical: 1,
	high: 0.75,
	moderate: 0.5,
	low: 0.25,
	unknown: 0.1
};

export interface RiskInput {
	/** Events considered relevant to the area being assessed. */
	events: DisasterEvent[];
	/**
	 * Optional InaRISK-derived hazard classification for the area, 0..1.
	 * Absent when the source is unavailable, in which case the factor is skipped
	 * and remaining weights are renormalized rather than scored as zero.
	 */
	hazardExposure?: number | null;
	/** Month (1-12) used for seasonal context. */
	month?: number;
}

export function scoreToLevel(score: number): RiskAssessment['level'] {
	if (score >= RISK_LEVEL_BANDS.very_high.min) return 'very_high';
	if (score >= RISK_LEVEL_BANDS.high.min) return 'high';
	if (score >= RISK_LEVEL_BANDS.moderate.min) return 'moderate';
	return 'low';
}

/**
 * Seasonal context factor.
 *
 * Indonesia's rainy season (roughly November–March) materially raises
 * hydro-meteorological risk. This is a documented climatological pattern from
 * BMKG's season products, encoded as a coarse weight — not a per-day prediction.
 */
export function seasonalFactor(month: number): { value: number; reason: string } {
	// Peak rainy season
	if (month === 12 || month === 1 || month === 2) {
		return { value: 0.85, reason: 'Puncak musim hujan (Desember–Februari)' };
	}
	// Transition into rainy season
	if (month === 11 || month === 3) {
		return { value: 0.6, reason: 'Masa transisi menuju/keluar musim hujan' };
	}
	// Dry season
	if (month >= 6 && month <= 9) {
		return { value: 0.45, reason: 'Musim kemarau — risiko karhutla dan kekeringan' };
	}
	// Transition into dry season
	return { value: 0.35, reason: 'Masa pancaroba' };
}

/**
 * Computes a risk assessment for a set of events.
 * The result always includes the full factor breakdown so users can see exactly
 * how the number was derived.
 */
export function assessRisk(input: RiskInput): RiskAssessment {
	const { events, hazardExposure = null, month = new Date().getMonth() + 1 } = input;
	const factors: RiskFactor[] = [];

	/* --- 1. Official warnings (highest authority signal) --- */
	const warnings = events.filter((e) => e.category === 'early_warning');
	const warningFactor = computeEventFactor(warnings);
	factors.push({
		key: 'officialWarning',
		label: 'Peringatan dini resmi',
		value: warningFactor,
		weight: RISK_WEIGHTS.officialWarning,
		reason: warnings.length
			? `${warnings.length} peringatan dini aktif dalam cakupan wilayah`
			: 'Tidak ada peringatan dini aktif'
	});

	/* --- 2. Recent occurred events --- */
	const recentEvents = events.filter(
		(e) => e.category === 'current_event' || e.category === 'observation'
	);
	const recentFactor = computeEventFactor(recentEvents);
	factors.push({
		key: 'recentEvents',
		label: 'Kejadian terkini',
		value: recentFactor,
		weight: RISK_WEIGHTS.recentEvents,
		reason: recentEvents.length
			? `${recentEvents.length} kejadian terkini tercatat`
			: 'Tidak ada kejadian terkini tercatat'
	});

	/* --- 3. Volcano activity --- */
	const volcanoes = events.filter((e) => e.type === 'volcano');
	const volcanoFactor = computeEventFactor(volcanoes);
	factors.push({
		key: 'volcanoActivity',
		label: 'Aktivitas gunung api',
		value: volcanoFactor,
		weight: RISK_WEIGHTS.volcanoActivity,
		reason: volcanoes.length
			? `${volcanoes.length} gunung api dalam status di atas normal`
			: 'Tidak ada gunung api berstatus di atas normal dalam cakupan'
	});

	/* --- 4. Seasonal context --- */
	const season = seasonalFactor(month);
	factors.push({
		key: 'seasonalContext',
		label: 'Konteks musim',
		value: season.value,
		weight: RISK_WEIGHTS.seasonalContext,
		reason: season.reason
	});

	/* --- 5. Published hazard exposure (optional, only when data exists) --- */
	if (hazardExposure !== null && hazardExposure !== undefined) {
		factors.push({
			key: 'hazardExposure',
			label: 'Peta bahaya wilayah',
			value: Math.max(0, Math.min(1, hazardExposure)),
			weight: RISK_WEIGHTS.hazardExposure,
			reason: 'Klasifikasi bahaya wilayah dari sumber resmi'
		});
	}

	/* --- 6. Weather forecast severity --- */
	const forecasts = events.filter((e) => e.category === 'forecast' && e.type !== 'season');
	const forecastFactor = computeEventFactor(forecasts);
	if (forecasts.length > 0) {
		factors.push({
			key: 'weatherForecast',
			label: 'Prakiraan cuaca',
			value: forecastFactor,
			weight: RISK_WEIGHTS.weatherForecast,
			reason: `${forecasts.length} prakiraan cuaca dengan potensi dampak`
		});
	}

	/* --- Weighted aggregation with renormalization --- */
	const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
	const weighted = factors.reduce((sum, f) => sum + f.value * f.weight, 0);
	const score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0;

	const clamped = Math.max(0, Math.min(100, score));

	return {
		score: clamped,
		level: scoreToLevel(clamped),
		factors,
		disclaimer: RISK_DISCLAIMER,
		generatedAt: new Date().toISOString()
	};
}

/**
 * Converts a set of events into a 0..1 factor value.
 *
 * Uses both the worst severity present and the count, so a single critical
 * warning outweighs several minor ones. Count is log-scaled to avoid runaway
 * scores on days with many routine events.
 */
export function computeEventFactor(events: DisasterEvent[]): number {
	if (events.length === 0) return 0;

	const worst = Math.max(...events.map((e) => SEVERITY_TO_VALUE[e.severity] ?? 0.1));
	// log2(n+1)/log2(6) reaches 1.0 at 5 concurrent events, then saturates.
	const countBoost = Math.min(1, Math.log2(events.length + 1) / Math.log2(6));
	// Weighted so the worst severity dominates (70%) but volume still matters (30%).
	return Math.min(1, worst * 0.7 + countBoost * 0.3);
}

/* ------------------------------------------------------------------ */
/* Area scoping                                                        */
/* ------------------------------------------------------------------ */

export interface AreaScope {
	latitude: number;
	longitude: number;
	radiusKm: number;
	province?: string;
}

/**
 * Selects events relevant to an area.
 *
 * An event is relevant when EITHER:
 *  - its `province` matches the scope's province (case-insensitively, either
 *    direction — this is how BMKG CAP alerts and PVMBG levels are tagged), OR
 *  - it has a known coordinate within `radiusKm` of the scope centre.
 *
 * Events with no province and no usable coordinate match neither test and are
 * excluded: they cannot be attributed to the area. The `0,0` placeholder used
 * for volcanoes without coordinates is treated as "no known coordinate" rather
 * than as a point in the Gulf of Guinea (consistent with the rest of the app).
 *
 * Note this is a union (province OR radius), not an intersection: a CAP warning
 * tagged to the province is relevant even if we cannot place it on the map.
 */
export function scopeEventsToArea(events: DisasterEvent[], scope: AreaScope): DisasterEvent[] {
	const wanted = scope.province?.toLowerCase();

	return events.filter((event) => {
		if (wanted && event.location.province) {
			const tagged = event.location.province.toLowerCase();
			if (tagged === wanted || tagged.includes(wanted) || wanted.includes(tagged)) {
				return true;
			}
		}

		const { latitude, longitude } = event.location;
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
		// 0,0 is the "coordinate unknown" placeholder; never a real location.
		if (latitude === 0 && longitude === 0) return false;

		return haversineKm(scope.latitude, scope.longitude, latitude, longitude) <= scope.radiusKm;
	});
}

/**
 * Risk score for a single event, used to rank items in lists.
 * This is a *relative* ranking aid, not a hazard probability.
 */
export function eventRiskScore(event: DisasterEvent): number {
	const severityWeight: Record<DisasterEvent['severity'], number> = {
		critical: 100,
		high: 75,
		moderate: 50,
		low: 25,
		unknown: 10
	};
	const categoryWeight: Record<DisasterEvent['category'], number> = {
		early_warning: 1,
		current_event: 0.95,
		observation: 0.7,
		forecast: 0.6,
		risk: 0.5,
		hazard: 0.45,
		historical: 0.3
	};

	const base = severityWeight[event.severity] ?? 10;
	const category = categoryWeight[event.category] ?? 0.5;

	// Recency decay: a warning issued 12 h ago is worth ~half of a fresh one.
	const ageHours = Math.max(0, (Date.now() - eventTimestamp(event)) / 3_600_000);
	const recency = 1 / (1 + ageHours / 24);

	return Math.round(base * category * (0.6 + 0.4 * recency));
}
