import type { Handle, HandleServerError } from '@sveltejs/kit';
import { config } from '$lib/server/config';

/**
 * Global server hooks.
 *
 * Two responsibilities:
 *  1. Attach security headers (including a Content-Security-Policy) to every
 *     response, so the app is hardened by default rather than relying on the
 *     edge platform's defaults.
 *  2. Provide a central error handler that logs server errors in a structured
 *     way without ever leaking an internal stack trace to the client.
 */

/**
 * Builds the CSP for the current request.
 *
 * The policy is deliberately explicit. MapLibre requires blob: workers and the
 * basemap/attribution hosts; BMKG weather icons and CAP source links are loaded
 * or opened from bmkg.go.id. In development Vite injects inline scripts and
 * connects to the HMR websocket, so `dev` relaxes those two directives only.
 */
function buildCsp(isDev: boolean): string {
	const scriptSrc = ["'self'", "'unsafe-inline'"];
	if (isDev) scriptSrc.push("'unsafe-eval'");

	// MapLibre workers are created from blob: URLs.
	const workerSrc = ["'self'", 'blob:'];

	const connectSrc = [
		"'self'",
		'https://data.bmkg.go.id',
		'https://api.bmkg.go.id',
		'https://magma.esdm.go.id',
		// Basemap tiles (CARTO / OpenStreetMap).
		'https://*.basemaps.cartocdn.com',
		'https://*.cartocdn.com',
		'https://tiles.openfreemap.org'
	];
	if (isDev) connectSrc.push('ws:', 'wss:');

	const imgSrc = [
		"'self'",
		'data:',
		'blob:',
		// BMKG weather condition icons.
		'https://*.bmkg.go.id',
		// Basemap raster fallbacks and attributions.
		'https://*.basemaps.cartocdn.com',
		'https://*.cartocdn.com'
	];

	// Vector basemaps fetch their glyph (font) ranges as .pbf files from the tile
	// hosts. If font-src does not allow those hosts the glyph requests are
	// blocked, MapLibre treats the style as broken, and the map renders blank
	// while every other part of the page looks fine.
	const fontSrc = ["'self'", 'data:', 'https://*.basemaps.cartocdn.com', 'https://*.cartocdn.com'];

	return [
		"default-src 'self'",
		`script-src ${scriptSrc.join(' ')}`,
		"style-src 'self' 'unsafe-inline'",
		`img-src ${imgSrc.join(' ')}`,
		`font-src ${fontSrc.join(' ')}`,
		`connect-src ${connectSrc.join(' ')}`,
		`worker-src ${workerSrc.join(' ')}`,
		"child-src 'self' blob:",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"object-src 'none'",
		"manifest-src 'self'"
	].join('; ');
}

export const handle: Handle = async ({ event, resolve }) => {
	const isDev = event.url.hostname === 'localhost' || event.url.hostname === '127.0.0.1';

	const response = await resolve(event);

	// Security headers applied to every response.
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		// Geolocation is allowed for our own origin only; everything else is off.
		'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
	);
	response.headers.set('X-DNS-Prefetch-Control', 'off');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');

	// CSP is only meaningful over the same document responses; setting it on
	// API JSON too is harmless and keeps the policy uniform.
	response.headers.set('Content-Security-Policy', buildCsp(isDev));

	// HSTS only makes sense on HTTPS deployments.
	if (!isDev) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};

/**
 * Structured server error logging.
 *
 * We log the real error (with stack) on the server for diagnosis, but return
 * only a safe, generic message to the client. For SvelteKit `error()` calls with
 * a 4xx status we preserve the intentional message so 404/400 pages read well.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const isExpected = status >= 400 && status < 500;

	if (!isExpected) {
		console.error(
			JSON.stringify({
				level: 'error',
				time: new Date().toISOString(),
				scope: 'hooks.handleError',
				status,
				path: event.url.pathname,
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				app: 'indonesia-disaster-monitor',
				logLevel: config.logLevel
			})
		);
	}

	return {
		message: isExpected ? message : 'Terjadi kesalahan pada server. Silakan coba lagi nanti.'
	};
};
