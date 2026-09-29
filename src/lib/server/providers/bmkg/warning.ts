import { fetchJson } from '$lib/server/http';
import { logger } from '$lib/server/logger';
import { parseXml, findAll, find, text, localName } from '$lib/server/xml';

/**
 * BMKG early weather warnings (CAP — Common Alerting Protocol).
 *
 * This is BMKG's OFFICIAL machine-readable warning product, documented at:
 *   https://github.com/infoBMKG/data-cap
 *
 * Verified live endpoints:
 *   RSS list : https://www.bmkg.go.id/alerts/nowcast/id/rss.xml      (18 active alerts observed)
 *   CAP detail: https://www.bmkg.go.id/alerts/nowcast/id/<CODE>_alert.xml
 *
 * Attribution is mandatory per BMKG's terms, which the UI always honours.
 */

export const CAP_RSS_URL = 'https://www.bmkg.go.id/alerts/nowcast/id/rss.xml';
export const CAP_BASE_URL = 'https://www.bmkg.go.id/alerts/nowcast/id/';

export interface CapAlertRef {
	/** Full URL of the CAP detail document. */
	url: string;
	/** Alert code parsed from the file name, e.g. CJB20260929003. */
	code: string | null;
	title: string;
	description: string;
	publishedAt: string | null;
	/** Region code BMKG embeds in the alert code, e.g. CJB -> Jawa Barat. */
	regionCode: string | null;
}

export interface CapAlert {
	identifier: string;
	sender: string;
	sent: string | null;
	status: string | null;
	msgType: string | null;
	event: string | null;
	urgency: string | null;
	severity: string | null;
	certainty: string | null;
	effective: string | null;
	expires: string | null;
	headline: string | null;
	description: string | null;
	instruction: string | null;
	areaDesc: string | null;
	web: string | null;
	contact: string | null;
	/** Raw CAP polygon strings, "lat,lon lat,lon ..." */
	polygons: string[];
	sourceUrl: string;
}

/* ---------------------------------------------------------------- */
/* RSS list                                                          */
/* ---------------------------------------------------------------- */

/** Parses the CAP nowcast RSS feed into a list of alert references. */
export function parseCapRss(xmlText: string): CapAlertRef[] {
	const root = parseXml(xmlText);
	const items = findAll(root, 'item');

	const refs: CapAlertRef[] = [];
	for (const item of items) {
		const link = text(item, 'link');
		if (!link) continue;

		const codeMatch = /([A-Z]{3}\d{9,})_alert\.xml/.exec(link);
		const code = codeMatch ? codeMatch[1] : null;

		const pubRaw = text(item, 'pubDate');
		let publishedAt: string | null = null;
		if (pubRaw) {
			const parsed = new Date(pubRaw);
			if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
		}

		refs.push({
			url: link,
			code,
			title: text(item, 'title') ?? 'Peringatan dini cuaca',
			description: text(item, 'description') ?? '',
			publishedAt,
			// Alert codes begin with the BMKG region group, e.g. "CJB" for Jawa Barat.
			regionCode: code ? code.slice(0, 3) : null
		});
	}

	return refs;
}

/* ---------------------------------------------------------------- */
/* CAP detail                                                        */
/* ---------------------------------------------------------------- */

/**
 * Parses a CAP 1.2 alert document.
 * Handles BMKG's namespace-qualified elements (urn:oasis:...:cap:1.2).
 */
export function parseCapAlert(xmlText: string, sourceUrl: string): CapAlert {
	const root = parseXml(xmlText);

	// BMKG wraps the payload in <alert><info>…</info></alert>; if the caller
	// passed a bare <info> element we still find it via DFS.
	const alertNode = localName(root.name) === 'alert' ? root : (find(root, 'alert') ?? root);
	const infoNode = find(alertNode, 'info') ?? alertNode;

	const polygons: string[] = [];
	for (const polygon of findAll(alertNode, 'polygon')) {
		const value = polygon.text.trim();
		if (value) polygons.push(value);
	}

	// areaDesc may repeat when several areas are affected; join for display.
	const areaDescs = findAll(alertNode, 'areaDesc')
		.map((node) => node.text.trim())
		.filter(Boolean);

	return {
		identifier: text(alertNode, 'identifier') ?? '',
		sender: text(alertNode, 'sender') ?? '',
		sent: normalizeCapDate(text(alertNode, 'sent')),
		status: text(alertNode, 'status'),
		msgType: text(alertNode, 'msgType'),
		event: text(infoNode, 'event'),
		urgency: text(infoNode, 'urgency'),
		severity: text(infoNode, 'severity'),
		certainty: text(infoNode, 'certainty'),
		effective: normalizeCapDate(text(infoNode, 'effective')),
		expires: normalizeCapDate(text(infoNode, 'expires')),
		headline: text(infoNode, 'headline'),
		description: text(infoNode, 'description'),
		instruction: text(infoNode, 'instruction'),
		areaDesc: areaDescs.length ? areaDescs.join(', ') : null,
		web: text(infoNode, 'web'),
		contact: text(infoNode, 'contact'),
		polygons,
		sourceUrl
	};
}

function normalizeCapDate(raw: string | null): string | null {
	if (!raw) return null;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Converts CAP polygon strings into a GeoJSON MultiPolygon.
 *
 * CAP encodes coordinates as "lat,lon lat,lon …" — latitude FIRST, the opposite
 * of GeoJSON. This function inverts the order, which is the single most common
 * source of bugs when consuming CAP data.
 */
export function capPolygonsToMultiPolygon(polygons: string[]): GeoJSON.MultiPolygon | null {
	const rings: number[][][] = [];

	for (const raw of polygons) {
		const pairs = raw
			.trim()
			.split(/\s+/)
			.map((pair) => pair.split(',').map((n) => Number.parseFloat(n.trim())))
			.filter((pair): pair is [number, number] => pair.length === 2 && pair.every(Number.isFinite));

		if (pairs.length < 3) continue;

		// GeoJSON wants [lon, lat]; CAP gives us [lat, lon].
		const ring: number[][] = pairs.map(([lat, lon]) => [lon, lat]);

		// Close the ring if the source did not.
		const first = ring[0];
		const last = ring[ring.length - 1];
		if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);

		rings.push(ring);
	}

	if (rings.length === 0) return null;
	return { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) };
}

/* ---------------------------------------------------------------- */
/* Fetching                                                          */
/* ---------------------------------------------------------------- */

export async function fetchCapRss(): Promise<{
	data: CapAlertRef[];
	url: string;
	durationMs: number;
}> {
	const result = await fetchJson<string>(CAP_RSS_URL, {
		parse: 'text',
		accept: 'application/rss+xml, application/xml, text/xml',
		timeoutMs: 15_000,
		retries: 2
	});

	return { data: parseCapRss(result.data), url: CAP_RSS_URL, durationMs: result.durationMs };
}

/**
 * Fetches CAP detail documents, bounded in parallel to stay a polite client.
 * Individual failures are skipped so one broken alert cannot sink the batch.
 */
export async function fetchCapAlerts(
	refs: CapAlertRef[],
	options: { limit?: number; concurrency?: number } = {}
): Promise<{ alerts: CapAlert[]; failed: number }> {
	const { limit = 25, concurrency = 4 } = options;
	const targets = refs.slice(0, limit);

	const alerts: CapAlert[] = [];
	let failed = 0;

	for (let i = 0; i < targets.length; i += concurrency) {
		const batch = targets.slice(i, i + concurrency);
		const settled = await Promise.allSettled(
			batch.map(async (ref) => {
				const result = await fetchJson<string>(ref.url, {
					parse: 'text',
					accept: 'application/xml, text/xml',
					timeoutMs: 12_000,
					retries: 1
				});
				return parseCapAlert(result.data, ref.url);
			})
		);

		for (const outcome of settled) {
			if (outcome.status === 'fulfilled') alerts.push(outcome.value);
			else {
				failed += 1;
				logger.warn('cap alert detail failed', { provider: 'bmkg', error: outcome.reason });
			}
		}
	}

	return { alerts, failed };
}
