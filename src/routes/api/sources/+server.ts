import type { RequestHandler } from './$types';
import { apiSuccess } from '$lib/server/api/response';
import { PROVIDER_DESCRIPTORS } from '$lib/server/services/health';

/**
 * GET /api/sources
 *
 * Static provenance catalogue: every external source this application can use,
 * who publishes it, what it is authoritative for, and where to verify it.
 *
 * This endpoint is intentionally dependency-free and deterministic so the
 * /sources page renders even when every upstream provider is unreachable.
 */

export const GET: RequestHandler = async () => {
	const sources = PROVIDER_DESCRIPTORS.map((descriptor) => ({
		id: descriptor.id,
		name: descriptor.name,
		attribution: descriptor.attribution,
		url: descriptor.url,
		domains: descriptor.domains,
		/** Data categories this source can legitimately produce. */
		categories: CATEGORY_BY_PROVIDER[descriptor.id] ?? ['current_event'],
		notes: NOTES_BY_PROVIDER[descriptor.id] ?? undefined
	}));

	return apiSuccess(
		{
			sources,
			disclaimer:
				'Aplikasi ini hanya menampilkan data dari sumber resmi Indonesia. Tidak ada data bencana yang dibuat-buat. ' +
				'Jika sumber tidak dapat dijangkau, aplikasi menampilkan status tidak tersedia alih-alih data pengganti.'
		},
		{
			source: 'Katalog internal',
			updatedAt: new Date().toISOString(),
			cached: true,
			count: sources.length
		}
	);
};

const CATEGORY_BY_PROVIDER: Record<string, string[]> = {
	'bmkg-earthquake': ['current_event', 'historical'],
	'bmkg-weather': ['forecast'],
	'bmkg-warning': ['early_warning'],
	'pvmbg-volcano': ['hazard', 'current_event'],
	'bnpb-disaster': ['current_event', 'historical'],
	'inarisk-hazard': ['hazard', 'risk']
};

const NOTES_BY_PROVIDER: Record<string, string> = {
	'bmkg-earthquake':
		'Daftar gempa yang sudah terjadi (gempa terbaru, gempa dirasakan). Aplikasi ini tidak memprediksi gempa.',
	'bmkg-warning':
		'Peringatan dini cuaca berbasis CAP. Hanya peringatan yang masih berlaku yang ditampilkan secara default.',
	'pvmbg-volcano':
		'Tingkat aktivitas gunung api bersifat resmi. Koordinat dari tabel referensi; gunung tanpa koordinat tidak dipetakan.',
	'bnpb-disaster':
		'Endpoint publik BNPB/DIBI tidak selalu dapat dijangkau. Bila tidak tersedia, aplikasi menampilkan status tidak tersedia.',
	'inarisk-hazard':
		'Peta bahaya InaRISK bersifat kajian wilayah, bukan kejadian terkini, dan tidak digabungkan dengan peringatan aktif.'
};
