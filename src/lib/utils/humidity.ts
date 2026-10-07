/**
 * Kelembapan (relative humidity) classification helpers.
 *
 * This is an **internal** comfort/derived indicator, not an official BMKG
 * product. BMKG publishes relative humidity as a percentage per forecast slot;
 * the bands below are a documented heuristic used purely to colour the UI, and
 * they are always labelled as our own classification.
 */

export type HumidityLevel = 'very_dry' | 'dry' | 'comfortable' | 'humid' | 'very_humid';

export interface HumidityBand {
	level: HumidityLevel;
	/** Inclusive lower bound (%). */
	min: number;
	/** Exclusive upper bound (%). */
	max: number;
	/** Indonesian label shown to the user. */
	label: string;
	/** Short advice/description, Indonesian. */
	description: string;
	/** Border/text/badge Tailwind classes, kept here so they stay consistent. */
	badgeClass: string;
	/** Solid hex value, used by the trend chart. */
	hex: string;
}

/**
 * Bands are ordered from driest to most humid. The first band whose `max`
 * exceeds the value wins; the last band catches everything above it.
 */
export const HUMIDITY_BANDS: readonly HumidityBand[] = [
	{
		level: 'very_dry',
		min: 0,
		max: 30,
		label: 'Sangat kering',
		description: 'Udara sangat kering',
		badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
		hex: '#b45309'
	},
	{
		level: 'dry',
		min: 30,
		max: 45,
		label: 'Kering',
		description: 'Udara cenderung kering',
		badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
		hex: '#d97706'
	},
	{
		level: 'comfortable',
		min: 45,
		max: 65,
		label: 'Nyaman',
		description: 'Kelembapan nyaman',
		badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
		hex: '#059669'
	},
	{
		level: 'humid',
		min: 65,
		max: 80,
		label: 'Lembap',
		description: 'Udara lembap',
		badgeClass: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
		hex: '#0284c7'
	},
	{
		level: 'very_humid',
		min: 80,
		max: Infinity,
		label: 'Sangat lembap',
		description: 'Udara sangat lembap',
		badgeClass: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
		hex: '#0d9488'
	}
] as const;

/** Classifies a relative-humidity percentage into a documented band. */
export function classifyHumidity(humidity: number | null | undefined): HumidityBand | null {
	if (humidity === null || humidity === undefined || !Number.isFinite(humidity)) return null;
	for (const band of HUMIDITY_BANDS) {
		if (humidity < band.max) return band;
	}
	return HUMIDITY_BANDS[HUMIDITY_BANDS.length - 1] ?? null;
}

/** Convenience: the Indonesian label for a humidity value, or null when absent. */
export function humidityLabel(humidity: number | null | undefined): string | null {
	return classifyHumidity(humidity)?.label ?? null;
}

/** True when the value falls outside the comfortable band (for emphasis). */
export function isHumidityNotable(humidity: number | null | undefined): boolean {
	const band = classifyHumidity(humidity);
	return band !== null && band.level !== 'comfortable';
}
