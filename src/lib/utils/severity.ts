import type { ExpressionSpecification } from 'maplibre-gl';
import type { DataCategory, DisasterType, Severity } from '$lib/types';

/**
 * Semantic design tokens for severity.
 *
 * Colour alone never conveys severity (accessibility requirement): every
 * severity also carries a label and a short glyph, and the UI renders both.
 */
export interface SeverityToken {
	key: Severity;
	label: string;
	shortLabel: string;
	/** Tailwind text/bg/border class bundles, kept here so they stay consistent. */
	text: string;
	bg: string;
	border: string;
	/** Solid hex values for map paint expressions. */
	hex: string;
	/** Distinct shape/glyph so severity is readable without colour. */
	glyph: string;
	description: string;
}

export const SEVERITY_TOKENS: Record<Severity, SeverityToken> = {
	unknown: {
		key: 'unknown',
		label: 'Belum diketahui',
		shortLabel: 'N/A',
		text: 'text-slate-600 dark:text-slate-300',
		bg: 'bg-slate-100 dark:bg-slate-800',
		border: 'border-slate-300 dark:border-slate-600',
		hex: '#94a3b8',
		glyph: '?',
		description: 'Tingkat belum dapat ditentukan dari data yang tersedia.'
	},
	low: {
		key: 'low',
		label: 'Rendah',
		shortLabel: 'Rendah',
		text: 'text-emerald-700 dark:text-emerald-300',
		bg: 'bg-emerald-50 dark:bg-emerald-950',
		border: 'border-emerald-300 dark:border-emerald-700',
		hex: '#059669',
		glyph: '●',
		description: 'Dampak terbatas atau tidak ada prakiraan signifikan.'
	},
	moderate: {
		key: 'moderate',
		label: 'Sedang',
		shortLabel: 'Sedang',
		text: 'text-amber-700 dark:text-amber-300',
		bg: 'bg-amber-50 dark:bg-amber-950',
		border: 'border-amber-300 dark:border-amber-700',
		hex: '#d97706',
		glyph: '◐',
		description: 'Perlu perhatian dan pemantauan berkala.'
	},
	high: {
		key: 'high',
		label: 'Tinggi',
		shortLabel: 'Tinggi',
		text: 'text-orange-700 dark:text-orange-300',
		bg: 'bg-orange-50 dark:bg-orange-950',
		border: 'border-orange-300 dark:border-orange-700',
		hex: '#ea580c',
		glyph: '◕',
		description: 'Berpotensi menimbulkan dampak; siapkan langkah mitigasi.'
	},
	critical: {
		key: 'critical',
		label: 'Sangat Tinggi',
		shortLabel: 'Kritis',
		text: 'text-red-700 dark:text-red-300',
		bg: 'bg-red-50 dark:bg-red-950',
		border: 'border-red-300 dark:border-red-700',
		hex: '#b91c1c',
		glyph: '⬤',
		description: 'Dampak serius; ikuti arahan resmi instansi berwenang.'
	}
};

export function severityToken(severity: Severity | null | undefined): SeverityToken {
	return SEVERITY_TOKENS[severity ?? 'unknown'] ?? SEVERITY_TOKENS.unknown;
}

/** Severity ordering for sorting warnings most-urgent-first. */
export const SEVERITY_ORDER: Record<Severity, number> = {
	critical: 5,
	high: 4,
	moderate: 3,
	low: 2,
	unknown: 1
};

export interface CategoryToken {
	key: DataCategory;
	label: string;
	/** Plain-language explanation shown in tooltips and the legend. */
	meaning: string;
	badgeClass: string;
}

/**
 * Category labels. These are the vocabulary that keeps the app honest:
 * a forecast is never described as a warning, a hazard map is never an event.
 */
export const CATEGORY_TOKENS: Record<DataCategory, CategoryToken> = {
	forecast: {
		key: 'forecast',
		label: 'Prakiraan',
		meaning: 'Perkiraan kondisi yang akan datang berdasarkan data resmi, bukan peringatan.',
		badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
	},
	early_warning: {
		key: 'early_warning',
		label: 'Peringatan Dini',
		meaning: 'Peringatan resmi yang diterbitkan instansi berwenang.',
		badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
	},
	current_event: {
		key: 'current_event',
		label: 'Kejadian Terkini',
		meaning: 'Peristiwa yang sudah terjadi dan masih berlangsung atau baru saja terjadi.',
		badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
	},
	observation: {
		key: 'observation',
		label: 'Pengamatan',
		meaning: 'Hasil pengamatan atau pengukuran yang telah dilakukan.',
		badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
	},
	historical: {
		key: 'historical',
		label: 'Historis',
		meaning: 'Catatan kejadian masa lalu yang digunakan sebagai rujukan.',
		badgeClass: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
	},
	hazard: {
		key: 'hazard',
		label: 'Peta Bahaya',
		meaning: 'Zona atau wilayah yang secara karakteristik berpotensi terkena bahaya.',
		badgeClass: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
	},
	risk: {
		key: 'risk',
		label: 'Peta Risiko',
		meaning: 'Gabungan bahaya, keterpaparan, dan kerentanan pada suatu wilayah.',
		badgeClass: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300'
	}
};

export function categoryToken(category: DataCategory | null | undefined): CategoryToken {
	return CATEGORY_TOKENS[category ?? 'observation'] ?? CATEGORY_TOKENS.observation;
}

export interface DisasterTypeToken {
	key: DisasterType;
	label: string;
	/** Lucide icon name; the icon component is resolved in the UI layer. */
	icon: string;
	/** Marker shape key handled by the map layer. */
	shape: 'point' | 'polygon' | 'line';
}

export const DISASTER_TYPE_TOKENS: Record<DisasterType, DisasterTypeToken> = {
	weather: { key: 'weather', label: 'Cuaca', icon: 'CloudSun', shape: 'point' },
	extreme_weather: { key: 'extreme_weather', label: 'Cuaca Ekstrem', icon: 'CloudLightning', shape: 'polygon' },
	earthquake: { key: 'earthquake', label: 'Gempa Bumi', icon: 'Activity', shape: 'point' },
	tsunami: { key: 'tsunami', label: 'Tsunami', icon: 'Waves', shape: 'point' },
	flood: { key: 'flood', label: 'Banjir', icon: 'Droplets', shape: 'polygon' },
	flash_flood: { key: 'flash_flood', label: 'Banjir Bandang', icon: 'Waves', shape: 'polygon' },
	landslide: { key: 'landslide', label: 'Tanah Longsor', icon: 'Mountain', shape: 'polygon' },
	volcano: { key: 'volcano', label: 'Gunung Api', icon: 'Flame', shape: 'point' },
	wildfire: { key: 'wildfire', label: 'Karhutla', icon: 'Flame', shape: 'point' },
	drought: { key: 'drought', label: 'Kekeringan', icon: 'Sun', shape: 'polygon' },
	high_wave: { key: 'high_wave', label: 'Gelombang Tinggi', icon: 'Waves', shape: 'polygon' },
	abrasion: { key: 'abrasion', label: 'Abrasi', icon: 'Waves', shape: 'polygon' },
	tornado: { key: 'tornado', label: 'Puting Beliung', icon: 'Wind', shape: 'point' },
	season: { key: 'season', label: 'Musim', icon: 'CalendarDays', shape: 'polygon' },
	other: { key: 'other', label: 'Lainnya', icon: 'CircleAlert', shape: 'point' }
};

export function disasterTypeToken(type: DisasterType | null | undefined): DisasterTypeToken {
	return DISASTER_TYPE_TOKENS[type ?? 'other'] ?? DISASTER_TYPE_TOKENS.other;
}

/** MapLibre paint expressions keyed by severity, used by the GeoJSON layers. */
export function severityMatchExpression(fallback = SEVERITY_TOKENS.unknown.hex): ExpressionSpecification {
	return [
		'match',
		['get', 'severity'],
		'critical',
		SEVERITY_TOKENS.critical.hex,
		'high',
		SEVERITY_TOKENS.high.hex,
		'moderate',
		SEVERITY_TOKENS.moderate.hex,
		'low',
		SEVERITY_TOKENS.low.hex,
		fallback
	] as unknown as ExpressionSpecification;
}
