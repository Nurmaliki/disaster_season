/**
 * Indonesian-facing formatting helpers built on Intl.
 * Default locale is id-ID; the module is structured so an `en` locale can be
 * added later without touching call sites.
 */

const LOCALE = 'id-ID';

/** Indonesian timezone abbreviations for the three national zones. */
export const TIMEZONE_LABELS: Record<string, string> = {
	'Asia/Jakarta': 'WIB',
	'Asia/Pontianak': 'WIB',
	'Asia/Makassar': 'WITA',
	'Asia/Jayapura': 'WIT'
};

export function timezoneLabel(timeZone: string | undefined): string {
	if (!timeZone) return 'WIB';
	return TIMEZONE_LABELS[timeZone] ?? timeZone;
}

/** Formats an instant as "29 September 2026, 14:30 WIB". */
export function formatDateTime(
	input: string | number | Date | null | undefined,
	timeZone = 'Asia/Jakarta'
): string {
	const date = toDate(input);
	if (!date) return '—';

	const formatted = new Intl.DateTimeFormat(LOCALE, {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone
	}).format(date);

	return `${formatted} ${timezoneLabel(timeZone)}`;
}

/** Formats a date without the time component. */
export function formatDate(
	input: string | number | Date | null | undefined,
	timeZone = 'Asia/Jakarta'
): string {
	const date = toDate(input);
	if (!date) return '—';
	return new Intl.DateTimeFormat(LOCALE, {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone
	}).format(date);
}

export function formatTime(
	input: string | number | Date | null | undefined,
	timeZone = 'Asia/Jakarta'
): string {
	const date = toDate(input);
	if (!date) return '—';
	const formatted = new Intl.DateTimeFormat(LOCALE, {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone
	}).format(date);
	return `${formatted} ${timezoneLabel(timeZone)}`;
}

/**
 * Human relative time in Indonesian, e.g. "2 menit lalu".
 * Falls back to an absolute date beyond a week, which is clearer than "312 jam lalu".
 */
export function formatRelative(
	input: string | number | Date | null | undefined,
	now: Date = new Date()
): string {
	const date = toDate(input);
	if (!date) return '—';

	const diffMs = now.getTime() - date.getTime();
	const future = diffMs < 0;
	const absSeconds = Math.abs(diffMs) / 1000;

	const render = (value: number, unit: Intl.RelativeTimeFormatUnit): string =>
		new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' }).format(
			future ? Math.ceil(value) : -Math.floor(value),
			unit
		);

	if (absSeconds < 45) return 'baru saja';
	if (absSeconds < 90) return render(1, 'minute');
	if (absSeconds < 3600) return render(absSeconds / 60, 'minute');
	if (absSeconds < 7200) return render(1, 'hour');
	if (absSeconds < 86400) return render(absSeconds / 3600, 'hour');
	if (absSeconds < 172800) return render(1, 'day');
	if (absSeconds < 604800) return render(absSeconds / 86400, 'day');
	return formatDate(date);
}

/** Formats a magnitude in BMKG style: "M 5,2". */
export function formatMagnitude(magnitude: number | null | undefined): string {
	if (magnitude === null || magnitude === undefined || !Number.isFinite(magnitude)) return '—';
	return `M ${new Intl.NumberFormat(LOCALE, {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1
	}).format(magnitude)}`;
}

export function formatNumber(
	value: number | null | undefined,
	options: Intl.NumberFormatOptions = {}
): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	return new Intl.NumberFormat(LOCALE, options).format(value);
}

export function formatTemperature(celsius: number | null | undefined): string {
	if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) return '—';
	return `${Math.round(celsius)}°C`;
}

export function formatDepth(km: number | null | undefined): string {
	if (km === null || km === undefined || !Number.isFinite(km)) return '—';
	return `${formatNumber(km, { maximumFractionDigits: 0 })} km`;
}

export function formatPrecipitation(mm: number | null | undefined): string {
	if (mm === null || mm === undefined || !Number.isFinite(mm)) return '—';
	return `${formatNumber(mm, { maximumFractionDigits: 1 })} mm`;
}

export function formatWind(kmh: number | null | undefined, direction?: string | null): string {
	if (kmh === null || kmh === undefined || !Number.isFinite(kmh)) return '—';
	const speed = `${formatNumber(kmh, { maximumFractionDigits: 0 })} km/jam`;
	return direction ? `${speed} ${direction}` : speed;
}

export function formatDistance(km: number | null | undefined): string {
	if (km === null || km === undefined || !Number.isFinite(km)) return '—';
	if (km < 1) return `${formatNumber(km * 1000, { maximumFractionDigits: 0 })} m`;
	if (km < 10) return `${formatNumber(km, { maximumFractionDigits: 1 })} km`;
	return `${formatNumber(km, { maximumFractionDigits: 0 })} km`;
}

/** "3 jam lalu" style age of a dataset. */
export function formatDataAge(updatedAt: string | null | undefined, now = new Date()): string {
	return formatRelative(updatedAt, now);
}

function toDate(input: string | number | Date | null | undefined): Date | null {
	if (input === null || input === undefined || input === '') return null;
	const date = input instanceof Date ? input : new Date(input);
	return Number.isNaN(date.getTime()) ? null : date;
}

export { LOCALE };
