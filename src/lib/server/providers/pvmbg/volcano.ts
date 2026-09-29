import { fetchJson } from '$lib/server/http';
import { logger } from '$lib/server/logger';
import { config } from '$lib/server/config';

/**
 * PVMBG / MAGMA Indonesia — volcanic activity levels.
 *
 * IMPORTANT (verified live, 2026):
 * MAGMA does NOT expose a clean, documented public JSON API. The upstream
 * `api/v1/*` routes answer HTTP 200 with an empty body `{"message": ""}`, so
 * they cannot be used as a data contract. The only reliably machine-readable
 * artefact is the server-rendered activity-level page:
 *
 *   GET https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas
 *
 * This adapter therefore parses that HTML table. It is deliberately isolated
 * behind the provider interface so the parsing can be swapped for a real JSON
 * API the moment PVMBG publishes one, without touching business logic.
 *
 * Upstream is slow (observed 25–60 s cold) and flaky, so the caller wraps this
 * in a long TTL + stale fallback. A missing volcano layer must never break the map.
 */
const ACTIVITY_URL = '/v1/gunung-api/tingkat-aktivitas';

export type VolcanoLevel = 'I' | 'II' | 'III' | 'IV';

export interface VolcanoRaw {
	name: string;
	/** Province / island grouping as printed by MAGMA, e.g. "Jawa Barat". */
	region: string;
	level: VolcanoLevel;
	levelLabel: string;
	/** Official recommendation text when present on the page. */
	recommendation?: string;
	/** Deep link to the official daily report. */
	reportUrl?: string;
}

/**
 * Well-known Indonesian volcanoes with coordinates.
 * MAGMA's activity table does not publish coordinates, so we join against this
 * static reference list (sourced from PVMBG's published volcano catalogue).
 * Volcanoes missing from this list are still returned, but without a map marker.
 */
export interface VolcanoReference {
	name: string;
	aliases?: string[];
	latitude: number;
	longitude: number;
	elevationM: number;
	province: string;
	type: 'stratovolcano' | 'caldera' | 'complex';
}

const LEVEL_LABELS: Record<VolcanoLevel, string> = {
	I: 'Level I (Normal)',
	II: 'Level II (Waspada)',
	III: 'Level III (Siaga)',
	IV: 'Level IV (Awas)'
};

function stripTags(html: string): string {
	return html
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

function levelFromLabel(label: string): VolcanoLevel | null {
	const match = label.match(/Level\s+(IV|III|II|I)\b/i);
	if (!match) return null;
	return match[1].toUpperCase() as VolcanoLevel;
}

/**
 * Parses the MAGMA activity table.
 *
 * The table renders one `<tr>` per volcano inside a per-level section. We scan
 * the document linearly, remembering the most recent "Level X (…)" heading, and
 * attach each subsequent volcano row to it. This tolerates markup changes in the
 * surrounding chrome far better than a rigid selector chain.
 */
export function parseActivityTable(html: string): VolcanoRaw[] {
	const results: VolcanoRaw[] = [];
	const seen = new Set<string>();

	let currentLevel: VolcanoLevel | null = null;
	let currentRecommendation: string | undefined;

	// Split on row boundaries so heading text can't bleed into volcano names.
	const chunks = html.split(/<tr[^>]*>/i);

	for (const chunk of chunks) {
		const rowHtml = chunk.split(/<\/tr>/i)[0] ?? '';
		if (!rowHtml.trim()) continue;

		const rowText = stripTags(rowHtml);

		// Level heading row, e.g. "Level III (Siaga) ... Hasil pengamatan ..."
		const levelMatch = rowText.match(/Level\s+(IV|III|II|I)\s*\(([^)]+)\)/i);
		if (levelMatch && !/Lihat laporan/i.test(rowText)) {
			currentLevel = levelMatch[1].toUpperCase() as VolcanoLevel;
			currentRecommendation = rowText
				.replace(/Level\s+(IV|III|II|I)\s*\([^)]+\)/i, '')
				.replace(/\b\d+\b\s*$/g, '')
				.trim();
			if (currentRecommendation.length < 15) currentRecommendation = undefined;
			continue;
		}

		if (!currentLevel) continue;

		// Volcano rows look like: "Merapi - Daerah Istimewa Yogyakarta  Lihat laporan"
		const linkMatch = rowHtml.match(/href="([^"]*\/v1\/gunung-api\/laporan\/[^"]+)"/i);
		const hasReportLink = /Lihat laporan/i.test(rowText);
		if (!hasReportLink && !linkMatch) continue;

		const nameText = rowText.replace(/Lihat laporan/gi, '').trim();
		if (!nameText) continue;

		// "Name - Region" (region optional, sometimes separated by a comma).
		const separatorIndex = nameText.indexOf(' - ');
		let name: string;
		let region = '';
		if (separatorIndex > 0) {
			name = nameText.slice(0, separatorIndex).trim();
			region = nameText.slice(separatorIndex + 3).trim();
		} else {
			name = nameText.trim();
		}

		// Drop stray trailing tokens like "(Awas)" or counts.
		name = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
		if (name.length < 3 || name.length > 60) continue;

		const dedupeKey = `${name}|${currentLevel}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);

		results.push({
			name,
			region,
			level: currentLevel,
			levelLabel: LEVEL_LABELS[currentLevel],
			recommendation: currentRecommendation,
			reportUrl: linkMatch
				? new URL(linkMatch[1], 'https://magma.esdm.go.id').toString()
				: undefined
		});
	}

	return results;
}

/** Also captures the summary counters (Awas/Siaga/Waspada/Normal totals). */
export function parseLevelCounts(html: string): Record<VolcanoLevel, number> {
	const counts: Record<VolcanoLevel, number> = { I: 0, II: 0, III: 0, IV: 0 };
	// Cards render as: <h1>3</h1><p>Level III (Siaga)</p>
	const cards = html.match(/<h1>\s*(\d+)\s*<\/h1>\s*<p>\s*Level\s+(IV|III|II|I)\b/gi) ?? [];
	for (const card of cards) {
		const match = card.match(/<h1>\s*(\d+)\s*<\/h1>\s*<p>\s*Level\s+(IV|III|II|I)\b/i);
		if (match) counts[match[2].toUpperCase() as VolcanoLevel] = Number.parseInt(match[1], 10);
	}
	return counts;
}

export async function fetchVolcanoActivity(): Promise<{
	volcanoes: VolcanoRaw[];
	counts: Record<VolcanoLevel, number>;
	status: number;
	durationMs: number;
	url: string;
}> {
	const url = `${config.providers.pvmbg.baseUrl}${ACTIVITY_URL}`;
	const result = await fetchJson<string>(url, {
		parse: 'text',
		accept: 'text/html,application/xhtml+xml',
		timeoutMs: config.providers.pvmbg.timeoutMs,
		retries: 1,
		headers: { 'user-agent': 'Mozilla/5.0 (compatible; IndonesiaDisasterMonitor/1.0)' }
	});

	const volcanoes = parseActivityTable(result.data);
	if (volcanoes.length === 0) {
		logger.warn('pvmbg activity table parsed to zero rows', {
			provider: 'pvmbg',
			endpoint: url,
			durationMs: result.durationMs
		});
		// Parser broke or page structure changed - surface as provider error so the
		// caller can serve stale cache rather than an empty volcano layer.
		throw new Error('PVMBG activity table could not be parsed');
	}

	return {
		volcanoes,
		counts: parseLevelCounts(result.data),
		status: result.status,
		durationMs: result.durationMs,
		url
	};
}

export { LEVEL_LABELS, levelFromLabel };
