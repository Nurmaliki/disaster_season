import type { DisasterEvent, ProviderMeta } from '$lib/types';
import { fetchJson } from '$lib/server/http';
import { config } from '$lib/server/config';

/**
 * BNPB — disaster event reporting (DIBI / Data Informasi Bencana Indonesia).
 *
 * STATUS (verified live, 2026): `bnpb.go.id` and `data.bnpb.go.id` resolve in
 * DNS but do not accept connections from general-purpose hosting, and BNPB has
 * no documented public JSON API for current disaster events. The DIBI dataset is
 * published as periodic downloads rather than a live feed.
 *
 * This adapter therefore performs a real availability probe (so /status tells
 * the truth) and normalizes the DIBI schema when a reachable endpoint is
 * configured through BNPB_BASE_URL. It never fabricates an event.
 */

export const bnpbMeta: ProviderMeta = {
	id: 'bnpb',
	name: 'BNPB (DIBI)',
	domains: ['flood', 'landslide', 'wildfire', 'extreme_weather', 'tornado', 'drought'],
	url: config.providers.bnpb.baseUrl,
	attribution: 'Badan Nasional Penanggulangan Bencana (BNPB) — DIBI',
	category: 'current_event',
	priority: 90
};

export interface BnpbRawDisaster {
	/** DIBI report id. */
	id?: string | number;
	/** Indonesian hazard name, e.g. "Banjir", "Tanah Longsor", "Cuaca Ekstrem". */
	jenis_bencana?: string;
	/** Sometimes nested as { nama: 'Banjir' }. */
	jenis_bencana_nama?: string;
	provinsi?: string;
	kabupaten?: string;
	kecamatan?: string;
	desa?: string;
	/** Report date, format varies: "2026-09-28" or "28/09/2026". */
	tanggal?: string;
	waktu?: string;
	latitude?: string | number;
	longitude?: string | number;
	korban?: number | string;
	rumah_rusak?: number | string;
	pengungsi?: number | string;
	keterangan?: string;
	sumber?: string;
	[K: string]: unknown;
}

/**
 * Parses the several date formats DIBI has used over the years.
 * Returns null rather than a wrong date, so bad rows can be dropped.
 */
export function parseBnpbDate(tanggal: string | undefined, waktu?: string): string | null {
	if (!tanggal) return null;
	const cleaned = tanggal.trim();

	// ISO: 2026-09-28
	const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned);
	if (iso) {
		const time = normalizeTime(waktu);
		return new Date(`${cleaned}T${time}Z`).toISOString();
	}

	// Indonesian: 28/09/2026 or 28-09-2026
	const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(cleaned);
	if (dmy) {
		const [, d, m, y] = dmy;
		const time = normalizeTime(waktu);
		const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${time}Z`);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}

	const arbitrary = new Date(cleaned);
	return Number.isNaN(arbitrary.getTime()) ? null : arbitrary.toISOString();
}

function normalizeTime(waktu: string | undefined): string {
	const match = waktu?.match(/(\d{1,2})[:.](\d{2})/);
	if (!match) return '00:00:00';
	return `${match[1].padStart(2, '0')}:${match[2]}:00`;
}

export function bnpbTypeToDisasterType(raw: string | undefined): string {
	const text = (raw ?? '').toLowerCase();
	if (text.includes('bandang')) return 'flash_flood';
	if (text.includes('banjir')) return 'flood';
	if (text.includes('longsor')) return 'landslide';
	if (text.includes('karhutla') || text.includes('kebakaran hutan')) return 'wildfire';
	if (text.includes('kekeringan')) return 'drought';
	if (text.includes('puting beliung')) return 'tornado';
	if (text.includes('gelombang') || text.includes('abrasi')) return 'high_wave';
	if (text.includes('cuaca')) return 'extreme_weather';
	if (text.includes('gunung')) return 'volcano';
	if (text.includes('gempa')) return 'earthquake';
	if (text.includes('tsunami')) return 'tsunami';
	return 'other';
}

/**
 * Severity for BNPB events is derived from impact indicators that BNPB itself
 * reports. It is always flagged as internally classified in the UI, because
 * BNPB does not publish a severity score for DIBI rows.
 */
export function bnpbImpactSeverity(record: BnpbRawDisaster): {
	severity: 'unknown' | 'low' | 'moderate' | 'high' | 'critical';
	reason: string;
} {
	const victims = toInt(record.korban);
	const displaced = toInt(record.pengungsi);
	const houses = toInt(record.rumah_rusak);

	if (victims !== null && victims >= 10)
		return { severity: 'critical', reason: `Dilaporkan ${victims} korban jiwa` };
	if (victims !== null && victims >= 1)
		return { severity: 'high', reason: `Dilaporkan ${victims} korban jiwa` };
	if (displaced !== null && displaced >= 500)
		return { severity: 'high', reason: `Dilaporkan ${displaced} pengungsi` };
	if (displaced !== null && displaced >= 50)
		return { severity: 'moderate', reason: `Dilaporkan ${displaced} pengungsi` };
	if (houses !== null && houses >= 100)
		return { severity: 'moderate', reason: `Dilaporkan ${houses} rumah rusak` };
	if (victims === 0 && displaced === 0)
		return { severity: 'low', reason: 'Tidak dilaporkan korban jiwa atau pengungsi' };
	return { severity: 'unknown', reason: 'Dampak belum dilaporkan lengkap' };
}

function toInt(value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;
	const numeric = typeof value === 'number' ? value : Number.parseInt(String(value).replace(/\D/g, ''), 10);
	return Number.isFinite(numeric) ? numeric : null;
}

const BNPB_BBOX = { minLat: -12, maxLat: 8, minLon: 93, maxLon: 142 };

/** Validates that a coordinate pair plausibly lies in Indonesia. */
export function isPlausibleIndonesianCoordinate(lat: number, lon: number): boolean {
	return (
		Number.isFinite(lat) &&
		Number.isFinite(lon) &&
		lat >= BNPB_BBOX.minLat &&
		lat <= BNPB_BBOX.maxLat &&
		lon >= BNPB_BBOX.minLon &&
		lon <= BNPB_BBOX.maxLon
	);
}

export async function probeBnpb(): Promise<{
	reachable: boolean;
	status?: number;
	error?: string;
	durationMs: number;
}> {
	const started = Date.now();
	try {
		const result = await fetchJson<unknown>(config.providers.bnpb.baseUrl, {
			timeoutMs: config.providers.bnpb.timeoutMs,
			retries: 0,
			parse: 'none',
			accept: 'text/html'
		});
		return { reachable: true, status: result.status, durationMs: Date.now() - started };
	} catch (error) {
		return {
			reachable: false,
			error: error instanceof Error ? error.message : String(error),
			durationMs: Date.now() - started
		};
	}
}

/**
 * Converts DIBI rows into the unified model.
 *
 * Rows without a plausible Indonesian coordinate are dropped for map purposes.
 * Valid rows become `current_event` when the report is recent and `historical`
 * when it is older, so the UI can honestly distinguish "happening" from "record".
 */
export function normalizeBnpbDisasters(
	records: BnpbRawDisaster[],
	retrievedAt: string,
	options: { recentWindowHours?: number } = {}
): DisasterEvent[] {
	const { recentWindowHours = 72 } = options;
	const events: DisasterEvent[] = [];
	const now = Date.now();

	for (const record of records) {
		const lat = typeof record.latitude === 'number' ? record.latitude : Number.parseFloat(String(record.latitude ?? ''));
		const lon = typeof record.longitude === 'number' ? record.longitude : Number.parseFloat(String(record.longitude ?? ''));
		if (!isPlausibleIndonesianCoordinate(lat, lon)) continue;

		const occurredAt = parseBnpbDate(record.tanggal, record.waktu);
		if (!occurredAt) continue;

		const type = bnpbTypeToDisasterType(
			(record.jenis_bencana as string) ?? (record.jenis_bencana_nama as string)
		) as DisasterEvent['type'];

		const { severity, reason } = bnpbImpactSeverity(record);
		const ageHours = (now - new Date(occurredAt).getTime()) / 3_600_000;

		const regionParts = [record.desa, record.kecamatan, record.kabupaten, record.provinsi].filter(
			(part): part is string => typeof part === 'string' && part.length > 0
		);
		const place = regionParts.length ? regionParts.join(', ') : 'Indonesia';

		const externalId = record.id !== undefined ? String(record.id) : `${occurredAt}-${lat}-${lon}-${type}`;

		events.push({
			id: `bnpb:disaster:${externalId}`,
			type,
			category: ageHours <= recentWindowHours ? 'current_event' : 'historical',
			title: `${(record.jenis_bencana as string) ?? 'Bencana'} — ${record.kabupaten ?? record.provinsi ?? 'Indonesia'}`,
			description: [
				`Lokasi: ${place}.`,
				record.keterangan ? String(record.keterangan) : null,
				reason
			]
				.filter(Boolean)
				.join(' '),
			severity,
			severityIsInternal: true,
			location: {
				latitude: lat,
				longitude: lon,
				province: record.provinsi,
				regency: record.kabupaten,
				district: record.kecamatan,
				village: record.desa
			},
			geometry: { type: 'Point', coordinates: [lon, lat] },
			occurredAt,
			updatedAt: occurredAt,
			retrievedAt,
			source: {
				name: bnpbMeta.attribution,
				url: bnpbMeta.url,
				sourceId: record.id !== undefined ? String(record.id) : undefined,
				priority: bnpbMeta.priority,
				retrievedAt
			},
			metadata: {
				impact: {
					victims: toInt(record.korban),
					displaced: toInt(record.pengungsi),
					damagedHouses: toInt(record.rumah_rusak)
				},
				severityReason: reason,
				nature: ageHours <= recentWindowHours ? 'reported_event' : 'historical_record'
			}
		});
	}

	return events;
}
