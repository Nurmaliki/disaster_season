import type { Province } from './provinces';
import { PROVINCES } from './provinces';

/**
 * Administrative region helpers.
 *
 * Region codes follow the official BPS/BIG `Kode Wilayah` scheme used by BMKG:
 *   adm1 = province   (2 digits)        e.g. "31"          DKI Jakarta
 *   adm2 = regency    (4 digits)        e.g. "31.71"       Kota Jakarta Pusat
 *   adm3 = district   (6 digits)        e.g. "31.71.01"    Gambir
 *   adm4 = village    (10 digits)       e.g. "31.71.01.1001"
 *
 * Only the province table is bundled (small and stable). Regency/district/village
 * lookups are resolved on demand so the initial bundle stays small.
 */

export interface RegionRef {
	code: string;
	name: string;
	level: 'country' | 'province' | 'regency' | 'district' | 'village';
	parentCode: string | null;
	latitude?: number;
	longitude?: number;
}

export const COUNTRY: RegionRef = {
	code: 'ID',
	name: 'Indonesia',
	level: 'country',
	parentCode: null,
	latitude: -2.5,
	longitude: 118
};

/**
 * Validates an administrative code for the given level.
 *
 * The official Kode Wilayah scheme uses 2-digit segments for province, regency
 * and district, but the village (adm4) segment is 4 digits — e.g. "31.71.01.1001".
 */
export function isAdmCode(level: 1 | 2 | 3 | 4, code: string): boolean {
	const segments = code.split('.');
	if (segments.length !== level) return false;

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		const expectedLength = i === 3 ? 4 : 2;
		if (!new RegExp(`^\\d{${expectedLength}}$`).test(segment)) return false;
	}
	return true;
}

/** Extracts the province (adm1) code from any lower-level code. */
export function provinceCodeOf(code: string): string {
	return code.slice(0, 2);
}

/** Extracts the regency (adm2) code, or null when the input is only a province. */
export function regencyCodeOf(code: string): string | null {
	const parts = code.split('.');
	return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
}

export function findProvinceByCode(code: string): Province | undefined {
	const normalized = provinceCodeOf(code);
	return PROVINCES.find((p) => p.code === normalized);
}

/**
 * Case- and diacritic-insensitive search across the bundled region table.
 * Ranking prefers exact, then prefix, then substring matches, and higher levels
 * first, so searching "Bandung" surfaces the city before villages named Bandung.
 */
export function searchRegions(query: string, limit = 12): RegionRef[] {
	const needle = normalize(query);
	if (needle.length < 2) return [];

	const results: Array<{ region: RegionRef; score: number }> = [];

	const consider = (region: RegionRef): void => {
		const haystack = normalize(region.name);
		let score = 0;

		if (haystack === needle) score = 100;
		else if (haystack.startsWith(needle)) score = 80;
		else if (haystack.includes(needle)) score = 50;
		// Also match the common "Kota"/"Kabupaten" prefixes stripped off.
		else if (normalize(region.name.replace(/^(kota|kabupaten|kab\.?)\s+/i, '')).startsWith(needle))
			score = 70;
		else return;

		// Prefer broader administrative levels when scores tie.
		const levelBonus = { province: 6, regency: 4, district: 2, village: 1, country: 10 };
		score += levelBonus[region.level] ?? 0;

		results.push({ region, score });
	};

	for (const province of PROVINCES) {
		consider({
			code: province.code,
			name: province.name,
			level: 'province',
			parentCode: null,
			latitude: province.latitude,
			longitude: province.longitude
		});
	}

	for (const regency of REGENCIES) {
		consider({
			code: regency.code,
			name: regency.name,
			level: 'regency',
			parentCode: provinceCodeOf(regency.code),
			latitude: regency.latitude,
			longitude: regency.longitude
		});
	}

	return results
		.sort((a, b) => b.score - a.score || a.region.name.localeCompare(b.region.name, 'id'))
		.slice(0, limit)
		.map((r) => r.region);
}

function normalize(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/* ------------------------------------------------------------------ */
/* Regency table                                                       */
/* ------------------------------------------------------------------ */

export interface RegencyEntry {
	code: string;
	name: string;
	latitude: number;
	longitude: number;
}

/**
 * Representative coordinates for every Indonesian regency/city.
 *
 * These are capital/centroid coordinates published with the BPS `Kode Wilayah`
 * scheme, used for map centring and "nearest" calculations only. They are NOT
 * hazard data and are never presented as such.
 */
export const REGENCIES: RegencyEntry[] = [
	// Aceh (11)
	{ code: '11.01', name: 'Kabupaten Aceh Selatan', latitude: 3.15, longitude: 97.45 },
	{ code: '11.02', name: 'Kabupaten Aceh Tenggara', latitude: 3.35, longitude: 97.85 },
	{ code: '11.03', name: 'Kabupaten Aceh Timur', latitude: 4.55, longitude: 97.85 },
	{ code: '11.04', name: 'Kabupaten Aceh Tengah', latitude: 4.55, longitude: 96.85 },
	{ code: '11.05', name: 'Kabupaten Aceh Barat', latitude: 4.45, longitude: 96.15 },
	{ code: '11.06', name: 'Kabupaten Aceh Besar', latitude: 5.45, longitude: 95.45 },
	{ code: '11.07', name: 'Kabupaten Pidie', latitude: 5.35, longitude: 96.0 },
	{ code: '11.08', name: 'Kabupaten Aceh Utara', latitude: 5.05, longitude: 97.15 },
	{ code: '11.09', name: 'Kabupaten Simeulue', latitude: 2.6, longitude: 96.05 },
	{ code: '11.10', name: 'Kabupaten Aceh Singkil', latitude: 2.35, longitude: 97.85 },
	{ code: '11.11', name: 'Kabupaten Bireuen', latitude: 5.2, longitude: 96.7 },
	{ code: '11.12', name: 'Kabupaten Aceh Barat Daya', latitude: 3.75, longitude: 96.85 },
	{ code: '11.13', name: 'Kabupaten Gayo Lues', latitude: 4.0, longitude: 97.35 },
	{ code: '11.14', name: 'Kabupaten Aceh Jaya', latitude: 4.85, longitude: 95.65 },
	{ code: '11.15', name: 'Kabupaten Nagan Raya', latitude: 4.15, longitude: 96.35 },
	{ code: '11.16', name: 'Kabupaten Aceh Tamiang', latitude: 4.25, longitude: 98.0 },
	{ code: '11.17', name: 'Kabupaten Bener Meriah', latitude: 4.75, longitude: 96.85 },
	{ code: '11.18', name: 'Kabupaten Pidie Jaya', latitude: 5.25, longitude: 96.2 },
	{ code: '11.71', name: 'Kota Banda Aceh', latitude: 5.55, longitude: 95.32 },
	{ code: '11.72', name: 'Kota Sabang', latitude: 5.89, longitude: 95.32 },
	{ code: '11.73', name: 'Kota Langsa', latitude: 4.47, longitude: 97.97 },
	{ code: '11.74', name: 'Kota Lhokseumawe', latitude: 5.18, longitude: 97.15 },
	{ code: '11.75', name: 'Kota Subulussalam', latitude: 2.75, longitude: 97.9 },

	// Sumatera Utara (12)
	{ code: '12.01', name: 'Kabupaten Tapanuli Tengah', latitude: 1.85, longitude: 98.65 },
	{ code: '12.02', name: 'Kabupaten Tapanuli Utara', latitude: 2.05, longitude: 99.05 },
	{ code: '12.03', name: 'Kabupaten Tapanuli Selatan', latitude: 1.35, longitude: 99.25 },
	{ code: '12.04', name: 'Kabupaten Nias', latitude: 1.1, longitude: 97.75 },
	{ code: '12.05', name: 'Kabupaten Langkat', latitude: 3.75, longitude: 98.35 },
	{ code: '12.06', name: 'Kabupaten Karo', latitude: 3.1, longitude: 98.5 },
	{ code: '12.07', name: 'Kabupaten Deli Serdang', latitude: 3.5, longitude: 98.7 },
	{ code: '12.08', name: 'Kabupaten Simalungun', latitude: 2.95, longitude: 99.0 },
	{ code: '12.09', name: 'Kabupaten Asahan', latitude: 2.95, longitude: 99.65 },
	{ code: '12.10', name: 'Kabupaten Labuhanbatu', latitude: 2.25, longitude: 100.05 },
	{ code: '12.11', name: 'Kabupaten Dairi', latitude: 2.85, longitude: 98.25 },
	{ code: '12.12', name: 'Kabupaten Toba Samosir', latitude: 2.35, longitude: 99.15 },
	{ code: '12.13', name: 'Kabupaten Mandailing Natal', latitude: 0.75, longitude: 99.4 },
	{ code: '12.14', name: 'Kabupaten Nias Selatan', latitude: 0.55, longitude: 98.0 },
	{ code: '12.15', name: 'Kabupaten Pakpak Bharat', latitude: 2.55, longitude: 98.25 },
	{ code: '12.16', name: 'Kabupaten Humbang Hasundutan', latitude: 2.25, longitude: 98.65 },
	{ code: '12.17', name: 'Kabupaten Samosir', latitude: 2.6, longitude: 98.75 },
	{ code: '12.18', name: 'Kabupaten Serdang Bedagai', latitude: 3.4, longitude: 99.0 },
	{ code: '12.19', name: 'Kabupaten Batu Bara', latitude: 3.15, longitude: 99.55 },
	{ code: '12.20', name: 'Kabupaten Padang Lawas Utara', latitude: 1.55, longitude: 99.75 },
	{ code: '12.21', name: 'Kabupaten Padang Lawas', latitude: 1.15, longitude: 99.85 },
	{ code: '12.22', name: 'Kabupaten Labuhanbatu Selatan', latitude: 1.85, longitude: 100.15 },
	{ code: '12.23', name: 'Kabupaten Labuhanbatu Utara', latitude: 2.55, longitude: 100.05 },
	{ code: '12.24', name: 'Kabupaten Nias Utara', latitude: 1.4, longitude: 97.4 },
	{ code: '12.25', name: 'Kabupaten Nias Barat', latitude: 1.05, longitude: 97.5 },
	{ code: '12.71', name: 'Kota Medan', latitude: 3.58, longitude: 98.67 },
	{ code: '12.72', name: 'Kota Pematangsiantar', latitude: 2.96, longitude: 99.07 },
	{ code: '12.73', name: 'Kota Sibolga', latitude: 1.74, longitude: 98.78 },
	{ code: '12.74', name: 'Kota Tanjungbalai', latitude: 2.97, longitude: 99.8 },
	{ code: '12.75', name: 'Kota Binjai', latitude: 3.6, longitude: 98.48 },
	{ code: '12.76', name: 'Kota Tebing Tinggi', latitude: 3.33, longitude: 99.16 },
	{ code: '12.77', name: 'Kota Padangsidimpuan', latitude: 1.38, longitude: 99.27 },
	{ code: '12.78', name: 'Kota Gunungsitoli', latitude: 1.29, longitude: 97.62 },

	// Sumatera Barat (13)
	{ code: '13.01', name: 'Kabupaten Pesisir Selatan', latitude: -1.85, longitude: 100.75 },
	{ code: '13.02', name: 'Kabupaten Solok', latitude: -0.85, longitude: 100.85 },
	{ code: '13.03', name: 'Kabupaten Sijunjung', latitude: -0.75, longitude: 101.05 },
	{ code: '13.04', name: 'Kabupaten Tanah Datar', latitude: -0.45, longitude: 100.6 },
	{ code: '13.05', name: 'Kabupaten Padang Pariaman', latitude: -0.55, longitude: 100.15 },
	{ code: '13.06', name: 'Kabupaten Agam', latitude: -0.25, longitude: 100.15 },
	{ code: '13.07', name: 'Kabupaten Lima Puluh Kota', latitude: -0.1, longitude: 100.65 },
	{ code: '13.08', name: 'Kabupaten Pasaman', latitude: 0.35, longitude: 100.15 },
	{ code: '13.09', name: 'Kabupaten Kepulauan Mentawai', latitude: -2.25, longitude: 99.75 },
	{ code: '13.10', name: 'Kabupaten Dharmasraya', latitude: -1.35, longitude: 101.65 },
	{ code: '13.11', name: 'Kabupaten Solok Selatan', latitude: -1.45, longitude: 101.25 },
	{ code: '13.12', name: 'Kabupaten Pasaman Barat', latitude: 0.15, longitude: 99.75 },
	{ code: '13.71', name: 'Kota Padang', latitude: -0.95, longitude: 100.35 },
	{ code: '13.72', name: 'Kota Solok', latitude: -0.79, longitude: 100.65 },
	{ code: '13.73', name: 'Kota Sawahlunto', latitude: -0.68, longitude: 100.78 },
	{ code: '13.74', name: 'Kota Padang Panjang', latitude: -0.47, longitude: 100.4 },
	{ code: '13.75', name: 'Kota Bukittinggi', latitude: -0.31, longitude: 100.37 },
	{ code: '13.76', name: 'Kota Payakumbuh', latitude: -0.23, longitude: 100.63 },
	{ code: '13.77', name: 'Kota Pariaman', latitude: -0.63, longitude: 100.12 },

	// Riau (14)
	{ code: '14.01', name: 'Kabupaten Kuantan Singingi', latitude: -0.55, longitude: 101.65 },
	{ code: '14.02', name: 'Kabupaten Indragiri Hulu', latitude: -0.55, longitude: 102.35 },
	{ code: '14.03', name: 'Kabupaten Indragiri Hilir', latitude: -0.35, longitude: 103.35 },
	{ code: '14.04', name: 'Kabupaten Pelalawan', latitude: 0.15, longitude: 102.15 },
	{ code: '14.05', name: 'Kabupaten Siak', latitude: 0.85, longitude: 101.55 },
	{ code: '14.06', name: 'Kabupaten Kampar', latitude: 0.35, longitude: 101.15 },
	{ code: '14.07', name: 'Kabupaten Rokan Hulu', latitude: 1.05, longitude: 100.55 },
	{ code: '14.08', name: 'Kabupaten Bengkalis', latitude: 1.45, longitude: 102.15 },
	{ code: '14.09', name: 'Kabupaten Rokan Hilir', latitude: 1.85, longitude: 100.85 },
	{ code: '14.10', name: 'Kabupaten Kepulauan Meranti', latitude: 0.95, longitude: 102.65 },
	{ code: '14.71', name: 'Kota Pekanbaru', latitude: 0.53, longitude: 101.45 },
	{ code: '14.72', name: 'Kota Dumai', latitude: 1.67, longitude: 101.45 },

	// Jambi (15)
	{ code: '15.01', name: 'Kabupaten Kerinci', latitude: -2.05, longitude: 101.45 },
	{ code: '15.02', name: 'Kabupaten Merangin', latitude: -2.15, longitude: 102.15 },
	{ code: '15.03', name: 'Kabupaten Sarolangun', latitude: -2.35, longitude: 102.65 },
	{ code: '15.04', name: 'Kabupaten Batanghari', latitude: -1.85, longitude: 103.15 },
	{ code: '15.05', name: 'Kabupaten Muaro Jambi', latitude: -1.55, longitude: 103.65 },
	{ code: '15.06', name: 'Kabupaten Tanjung Jabung Barat', latitude: -1.15, longitude: 103.15 },
	{ code: '15.07', name: 'Kabupaten Tanjung Jabung Timur', latitude: -1.15, longitude: 103.85 },
	{ code: '15.08', name: 'Kabupaten Bungo', latitude: -1.55, longitude: 102.15 },
	{ code: '15.09', name: 'Kabupaten Tebo', latitude: -1.35, longitude: 102.35 },
	{ code: '15.71', name: 'Kota Jambi', latitude: -1.61, longitude: 103.61 },
	{ code: '15.72', name: 'Kota Sungai Penuh', latitude: -2.06, longitude: 101.39 },

	// Sumatera Selatan (16)
	{ code: '16.01', name: 'Kabupaten Ogan Komering Ulu', latitude: -4.15, longitude: 104.05 },
	{ code: '16.02', name: 'Kabupaten Ogan Komering Ilir', latitude: -3.35, longitude: 105.15 },
	{ code: '16.03', name: 'Kabupaten Muara Enim', latitude: -3.65, longitude: 103.75 },
	{ code: '16.04', name: 'Kabupaten Lahat', latitude: -3.75, longitude: 103.45 },
	{ code: '16.05', name: 'Kabupaten Musi Rawas', latitude: -3.05, longitude: 103.15 },
	{ code: '16.06', name: 'Kabupaten Musi Banyuasin', latitude: -2.55, longitude: 103.65 },
	{ code: '16.07', name: 'Kabupaten Banyuasin', latitude: -2.35, longitude: 104.55 },
	{ code: '16.08', name: 'Kabupaten Ogan Komering Ulu Timur', latitude: -4.05, longitude: 104.55 },
	{ code: '16.09', name: 'Kabupaten Ogan Komering Ulu Selatan', latitude: -4.65, longitude: 103.85 },
	{ code: '16.10', name: 'Kabupaten Ogan Ilir', latitude: -3.35, longitude: 104.65 },
	{ code: '16.11', name: 'Kabupaten Empat Lawang', latitude: -3.55, longitude: 103.05 },
	{ code: '16.12', name: 'Kabupaten Penukal Abab Lematang Ilir', latitude: -3.15, longitude: 104.05 },
	{ code: '16.13', name: 'Kabupaten Musi Rawas Utara', latitude: -2.65, longitude: 102.85 },
	{ code: '16.71', name: 'Kota Palembang', latitude: -2.99, longitude: 104.76 },
	{ code: '16.72', name: 'Kota Pagar Alam', latitude: -4.02, longitude: 103.25 },
	{ code: '16.73', name: 'Kota Lubuklinggau', latitude: -3.3, longitude: 102.86 },
	{ code: '16.74', name: 'Kota Prabumulih', latitude: -3.43, longitude: 104.23 },

	// Bengkulu (17)
	{ code: '17.01', name: 'Kabupaten Bengkulu Selatan', latitude: -4.35, longitude: 103.05 },
	{ code: '17.02', name: 'Kabupaten Rejang Lebong', latitude: -3.45, longitude: 102.55 },
	{ code: '17.03', name: 'Kabupaten Bengkulu Utara', latitude: -3.35, longitude: 102.05 },
	{ code: '17.04', name: 'Kabupaten Kaur', latitude: -4.65, longitude: 103.35 },
	{ code: '17.05', name: 'Kabupaten Seluma', latitude: -4.05, longitude: 102.65 },
	{ code: '17.06', name: 'Kabupaten Mukomuko', latitude: -3.05, longitude: 101.55 },
	{ code: '17.07', name: 'Kabupaten Lebong', latitude: -3.15, longitude: 102.25 },
	{ code: '17.08', name: 'Kabupaten Kepahiang', latitude: -3.65, longitude: 102.55 },
	{ code: '17.09', name: 'Kabupaten Bengkulu Tengah', latitude: -3.65, longitude: 102.35 },
	{ code: '17.71', name: 'Kota Bengkulu', latitude: -3.8, longitude: 102.26 },

	// Lampung (18)
	{ code: '18.01', name: 'Kabupaten Lampung Selatan', latitude: -5.55, longitude: 105.55 },
	{ code: '18.02', name: 'Kabupaten Lampung Tengah', latitude: -4.95, longitude: 105.15 },
	{ code: '18.03', name: 'Kabupaten Lampung Utara', latitude: -4.85, longitude: 104.75 },
	{ code: '18.04', name: 'Kabupaten Lampung Barat', latitude: -5.15, longitude: 104.35 },
	{ code: '18.05', name: 'Kabupaten Tulang Bawang', latitude: -4.45, longitude: 105.35 },
	{ code: '18.06', name: 'Kabupaten Tanggamus', latitude: -5.45, longitude: 104.65 },
	{ code: '18.07', name: 'Kabupaten Lampung Timur', latitude: -5.15, longitude: 105.65 },
	{ code: '18.08', name: 'Kabupaten Way Kanan', latitude: -4.55, longitude: 104.55 },
	{ code: '18.09', name: 'Kabupaten Pesawaran', latitude: -5.45, longitude: 105.05 },
	{ code: '18.10', name: 'Kabupaten Pringsewu', latitude: -5.35, longitude: 104.95 },
	{ code: '18.11', name: 'Kabupaten Mesuji', latitude: -4.05, longitude: 105.35 },
	{ code: '18.12', name: 'Kabupaten Tulang Bawang Barat', latitude: -4.35, longitude: 105.05 },
	{ code: '18.13', name: 'Kabupaten Pesisir Barat', latitude: -5.15, longitude: 103.95 },
	{ code: '18.71', name: 'Kota Bandar Lampung', latitude: -5.4, longitude: 105.26 },
	{ code: '18.72', name: 'Kota Metro', latitude: -5.11, longitude: 105.3 },

	// Kepulauan Bangka Belitung (19)
	{ code: '19.01', name: 'Kabupaten Bangka', latitude: -1.9, longitude: 105.9 },
	{ code: '19.02', name: 'Kabupaten Belitung', latitude: -2.85, longitude: 107.65 },
	{ code: '19.03', name: 'Kabupaten Bangka Barat', latitude: -1.85, longitude: 105.35 },
	{ code: '19.04', name: 'Kabupaten Bangka Tengah', latitude: -2.35, longitude: 106.25 },
	{ code: '19.05', name: 'Kabupaten Bangka Selatan', latitude: -2.75, longitude: 106.15 },
	{ code: '19.06', name: 'Kabupaten Belitung Timur', latitude: -2.85, longitude: 108.15 },
	{ code: '19.71', name: 'Kota Pangkal Pinang', latitude: -2.13, longitude: 106.11 },

	// Kepulauan Riau (21)
	{ code: '21.01', name: 'Kabupaten Bintan', latitude: 0.95, longitude: 104.65 },
	{ code: '21.02', name: 'Kabupaten Karimun', latitude: 0.95, longitude: 103.35 },
	{ code: '21.03', name: 'Kabupaten Natuna', latitude: 3.95, longitude: 108.25 },
	{ code: '21.04', name: 'Kabupaten Lingga', latitude: -0.15, longitude: 104.65 },
	{ code: '21.05', name: 'Kabupaten Kepulauan Anambas', latitude: 3.15, longitude: 106.15 },
	{ code: '21.71', name: 'Kota Batam', latitude: 1.13, longitude: 104.05 },
	{ code: '21.72', name: 'Kota Tanjung Pinang', latitude: 0.92, longitude: 104.45 },

	// DKI Jakarta (31)
	{ code: '31.01', name: 'Kabupaten Administrasi Kepulauan Seribu', latitude: -5.6, longitude: 106.55 },
	{ code: '31.71', name: 'Kota Adm. Jakarta Pusat', latitude: -6.18, longitude: 106.83 },
	{ code: '31.72', name: 'Kota Adm. Jakarta Utara', latitude: -6.12, longitude: 106.9 },
	{ code: '31.73', name: 'Kota Adm. Jakarta Barat', latitude: -6.17, longitude: 106.75 },
	{ code: '31.74', name: 'Kota Adm. Jakarta Selatan', latitude: -6.26, longitude: 106.8 },
	{ code: '31.75', name: 'Kota Adm. Jakarta Timur', latitude: -6.22, longitude: 106.9 },

	// Jawa Barat (32)
	{ code: '32.01', name: 'Kabupaten Bogor', latitude: -6.55, longitude: 106.75 },
	{ code: '32.02', name: 'Kabupaten Sukabumi', latitude: -6.95, longitude: 106.75 },
	{ code: '32.03', name: 'Kabupaten Cianjur', latitude: -6.85, longitude: 107.15 },
	{ code: '32.04', name: 'Kabupaten Bandung', latitude: -7.05, longitude: 107.55 },
	{ code: '32.05', name: 'Kabupaten Garut', latitude: -7.35, longitude: 107.75 },
	{ code: '32.06', name: 'Kabupaten Tasikmalaya', latitude: -7.45, longitude: 108.15 },
	{ code: '32.07', name: 'Kabupaten Ciamis', latitude: -7.35, longitude: 108.45 },
	{ code: '32.08', name: 'Kabupaten Kuningan', latitude: -6.95, longitude: 108.5 },
	{ code: '32.09', name: 'Kabupaten Cirebon', latitude: -6.75, longitude: 108.55 },
	{ code: '32.10', name: 'Kabupaten Majalengka', latitude: -6.85, longitude: 108.25 },
	{ code: '32.11', name: 'Kabupaten Sumedang', latitude: -6.85, longitude: 107.95 },
	{ code: '32.12', name: 'Kabupaten Indramayu', latitude: -6.35, longitude: 108.35 },
	{ code: '32.13', name: 'Kabupaten Subang', latitude: -6.55, longitude: 107.75 },
	{ code: '32.14', name: 'Kabupaten Purwakarta', latitude: -6.55, longitude: 107.45 },
	{ code: '32.15', name: 'Kabupaten Karawang', latitude: -6.3, longitude: 107.3 },
	{ code: '32.16', name: 'Kabupaten Bekasi', latitude: -6.25, longitude: 107.15 },
	{ code: '32.17', name: 'Kabupaten Bandung Barat', latitude: -6.85, longitude: 107.5 },
	{ code: '32.18', name: 'Kabupaten Pangandaran', latitude: -7.65, longitude: 108.5 },
	{ code: '32.71', name: 'Kota Bogor', latitude: -6.6, longitude: 106.8 },
	{ code: '32.72', name: 'Kota Sukabumi', latitude: -7.0, longitude: 106.55 },
	{ code: '32.73', name: 'Kota Bandung', latitude: -6.91, longitude: 107.61 },
	{ code: '32.74', name: 'Kota Cirebon', latitude: -6.71, longitude: 108.55 },
	{ code: '32.75', name: 'Kota Bekasi', latitude: -6.24, longitude: 106.99 },
	{ code: '32.76', name: 'Kota Depok', latitude: -6.4, longitude: 106.82 },
	{ code: '32.77', name: 'Kota Cimahi', latitude: -6.87, longitude: 107.54 },
	{ code: '32.78', name: 'Kota Tasikmalaya', latitude: -7.33, longitude: 108.22 },
	{ code: '32.79', name: 'Kota Banjar', latitude: -7.37, longitude: 108.53 },

	// Jawa Tengah (33)
	{ code: '33.01', name: 'Kabupaten Cilacap', latitude: -7.45, longitude: 108.95 },
	{ code: '33.02', name: 'Kabupaten Banyumas', latitude: -7.5, longitude: 109.25 },
	{ code: '33.03', name: 'Kabupaten Purbalingga', latitude: -7.35, longitude: 109.35 },
	{ code: '33.04', name: 'Kabupaten Banjarnegara', latitude: -7.35, longitude: 109.65 },
	{ code: '33.05', name: 'Kabupaten Kebumen', latitude: -7.65, longitude: 109.65 },
	{ code: '33.06', name: 'Kabupaten Purworejo', latitude: -7.7, longitude: 110.0 },
	{ code: '33.07', name: 'Kabupaten Wonosobo', latitude: -7.35, longitude: 109.9 },
	{ code: '33.08', name: 'Kabupaten Magelang', latitude: -7.5, longitude: 110.2 },
	{ code: '33.09', name: 'Kabupaten Boyolali', latitude: -7.45, longitude: 110.65 },
	{ code: '33.10', name: 'Kabupaten Klaten', latitude: -7.7, longitude: 110.65 },
	{ code: '33.11', name: 'Kabupaten Sukoharjo', latitude: -7.65, longitude: 110.85 },
	{ code: '33.12', name: 'Kabupaten Wonogiri', latitude: -7.85, longitude: 110.95 },
	{ code: '33.13', name: 'Kabupaten Karanganyar', latitude: -7.6, longitude: 111.05 },
	{ code: '33.14', name: 'Kabupaten Sragen', latitude: -7.4, longitude: 111.0 },
	{ code: '33.15', name: 'Kabupaten Grobogan', latitude: -7.05, longitude: 110.85 },
	{ code: '33.16', name: 'Kabupaten Blora', latitude: -7.0, longitude: 111.35 },
	{ code: '33.17', name: 'Kabupaten Rembang', latitude: -6.75, longitude: 111.45 },
	{ code: '33.18', name: 'Kabupaten Pati', latitude: -6.75, longitude: 111.05 },
	{ code: '33.19', name: 'Kabupaten Kudus', latitude: -6.8, longitude: 110.85 },
	{ code: '33.20', name: 'Kabupaten Jepara', latitude: -6.6, longitude: 110.65 },
	{ code: '33.21', name: 'Kabupaten Demak', latitude: -6.9, longitude: 110.65 },
	{ code: '33.22', name: 'Kabupaten Semarang', latitude: -7.15, longitude: 110.45 },
	{ code: '33.23', name: 'Kabupaten Temanggung', latitude: -7.25, longitude: 110.15 },
	{ code: '33.24', name: 'Kabupaten Kendal', latitude: -7.0, longitude: 110.25 },
	{ code: '33.25', name: 'Kabupaten Batang', latitude: -7.0, longitude: 109.85 },
	{ code: '33.26', name: 'Kabupaten Pekalongan', latitude: -7.05, longitude: 109.65 },
	{ code: '33.27', name: 'Kabupaten Pemalang', latitude: -7.05, longitude: 109.4 },
	{ code: '33.28', name: 'Kabupaten Tegal', latitude: -7.05, longitude: 109.15 },
	{ code: '33.29', name: 'Kabupaten Brebes', latitude: -7.05, longitude: 108.9 },
	{ code: '33.71', name: 'Kota Magelang', latitude: -7.47, longitude: 110.22 },
	{ code: '33.72', name: 'Kota Surakarta', latitude: -7.57, longitude: 110.83 },
	{ code: '33.73', name: 'Kota Salatiga', latitude: -7.33, longitude: 110.5 },
	{ code: '33.74', name: 'Kota Semarang', latitude: -6.99, longitude: 110.42 },
	{ code: '33.75', name: 'Kota Pekalongan', latitude: -6.89, longitude: 109.68 },
	{ code: '33.76', name: 'Kota Tegal', latitude: -6.87, longitude: 109.14 },

	// DI Yogyakarta (34)
	{ code: '34.01', name: 'Kabupaten Kulon Progo', latitude: -7.85, longitude: 110.15 },
	{ code: '34.02', name: 'Kabupaten Bantul', latitude: -7.9, longitude: 110.35 },
	{ code: '34.03', name: 'Kabupaten Gunung Kidul', latitude: -7.95, longitude: 110.65 },
	{ code: '34.04', name: 'Kabupaten Sleman', latitude: -7.7, longitude: 110.35 },
	{ code: '34.71', name: 'Kota Yogyakarta', latitude: -7.8, longitude: 110.36 },

	// Jawa Timur (35)
	{ code: '35.01', name: 'Kabupaten Pacitan', latitude: -8.2, longitude: 111.1 },
	{ code: '35.02', name: 'Kabupaten Ponorogo', latitude: -7.9, longitude: 111.5 },
	{ code: '35.03', name: 'Kabupaten Trenggalek', latitude: -8.05, longitude: 111.7 },
	{ code: '35.04', name: 'Kabupaten Tulungagung', latitude: -8.05, longitude: 111.9 },
	{ code: '35.05', name: 'Kabupaten Blitar', latitude: -8.15, longitude: 112.25 },
	{ code: '35.06', name: 'Kabupaten Kediri', latitude: -7.85, longitude: 112.05 },
	{ code: '35.07', name: 'Kabupaten Malang', latitude: -8.15, longitude: 112.55 },
	{ code: '35.08', name: 'Kabupaten Lumajang', latitude: -8.15, longitude: 113.15 },
	{ code: '35.09', name: 'Kabupaten Jember', latitude: -8.2, longitude: 113.65 },
	{ code: '35.10', name: 'Kabupaten Banyuwangi', latitude: -8.3, longitude: 114.35 },
	{ code: '35.11', name: 'Kabupaten Bondowoso', latitude: -7.95, longitude: 113.85 },
	{ code: '35.12', name: 'Kabupaten Situbondo', latitude: -7.7, longitude: 114.0 },
	{ code: '35.13', name: 'Kabupaten Probolinggo', latitude: -7.75, longitude: 113.45 },
	{ code: '35.14', name: 'Kabupaten Pasuruan', latitude: -7.7, longitude: 112.85 },
	{ code: '35.15', name: 'Kabupaten Sidoarjo', latitude: -7.45, longitude: 112.7 },
	{ code: '35.16', name: 'Kabupaten Mojokerto', latitude: -7.5, longitude: 112.45 },
	{ code: '35.17', name: 'Kabupaten Jombang', latitude: -7.55, longitude: 112.25 },
	{ code: '35.18', name: 'Kabupaten Nganjuk', latitude: -7.6, longitude: 111.9 },
	{ code: '35.19', name: 'Kabupaten Madiun', latitude: -7.6, longitude: 111.55 },
	{ code: '35.20', name: 'Kabupaten Magetan', latitude: -7.65, longitude: 111.35 },
	{ code: '35.21', name: 'Kabupaten Ngawi', latitude: -7.45, longitude: 111.35 },
	{ code: '35.22', name: 'Kabupaten Bojonegoro', latitude: -7.15, longitude: 111.9 },
	{ code: '35.23', name: 'Kabupaten Tuban', latitude: -6.95, longitude: 112.05 },
	{ code: '35.24', name: 'Kabupaten Lamongan', latitude: -7.1, longitude: 112.35 },
	{ code: '35.25', name: 'Kabupaten Gresik', latitude: -7.15, longitude: 112.6 },
	{ code: '35.26', name: 'Kabupaten Bangkalan', latitude: -7.05, longitude: 112.85 },
	{ code: '35.27', name: 'Kabupaten Sampang', latitude: -7.05, longitude: 113.25 },
	{ code: '35.28', name: 'Kabupaten Pamekasan', latitude: -7.05, longitude: 113.55 },
	{ code: '35.29', name: 'Kabupaten Sumenep', latitude: -7.0, longitude: 113.85 },
	{ code: '35.71', name: 'Kota Kediri', latitude: -7.82, longitude: 112.02 },
	{ code: '35.72', name: 'Kota Blitar', latitude: -8.1, longitude: 112.16 },
	{ code: '35.73', name: 'Kota Malang', latitude: -7.98, longitude: 112.63 },
	{ code: '35.74', name: 'Kota Probolinggo', latitude: -7.75, longitude: 113.22 },
	{ code: '35.75', name: 'Kota Pasuruan', latitude: -7.65, longitude: 112.9 },
	{ code: '35.76', name: 'Kota Mojokerto', latitude: -7.47, longitude: 112.43 },
	{ code: '35.77', name: 'Kota Madiun', latitude: -7.63, longitude: 111.52 },
	{ code: '35.78', name: 'Kota Surabaya', latitude: -7.25, longitude: 112.75 },
	{ code: '35.79', name: 'Kota Batu', latitude: -7.87, longitude: 112.52 },

	// Banten (36)
	{ code: '36.01', name: 'Kabupaten Pandeglang', latitude: -6.55, longitude: 105.75 },
	{ code: '36.02', name: 'Kabupaten Lebak', latitude: -6.6, longitude: 106.25 },
	{ code: '36.03', name: 'Kabupaten Tangerang', latitude: -6.25, longitude: 106.5 },
	{ code: '36.04', name: 'Kabupaten Serang', latitude: -6.15, longitude: 106.15 },
	{ code: '36.71', name: 'Kota Tangerang', latitude: -6.18, longitude: 106.63 },
	{ code: '36.72', name: 'Kota Cilegon', latitude: -6.0, longitude: 106.0 },
	{ code: '36.73', name: 'Kota Serang', latitude: -6.11, longitude: 106.15 },
	{ code: '36.74', name: 'Kota Tangerang Selatan', latitude: -6.29, longitude: 106.72 },

	// Bali (51)
	{ code: '51.01', name: 'Kabupaten Jembrana', latitude: -8.35, longitude: 114.65 },
	{ code: '51.02', name: 'Kabupaten Tabanan', latitude: -8.45, longitude: 115.05 },
	{ code: '51.03', name: 'Kabupaten Badung', latitude: -8.55, longitude: 115.2 },
	{ code: '51.04', name: 'Kabupaten Gianyar', latitude: -8.5, longitude: 115.3 },
	{ code: '51.05', name: 'Kabupaten Klungkung', latitude: -8.55, longitude: 115.4 },
	{ code: '51.06', name: 'Kabupaten Bangli', latitude: -8.35, longitude: 115.35 },
	{ code: '51.07', name: 'Kabupaten Karangasem', latitude: -8.4, longitude: 115.6 },
	{ code: '51.08', name: 'Kabupaten Buleleng', latitude: -8.2, longitude: 115.15 },
	{ code: '51.71', name: 'Kota Denpasar', latitude: -8.65, longitude: 115.22 },

	// Nusa Tenggara Barat (52)
	{ code: '52.01', name: 'Kabupaten Lombok Barat', latitude: -8.65, longitude: 116.1 },
	{ code: '52.02', name: 'Kabupaten Lombok Tengah', latitude: -8.7, longitude: 116.3 },
	{ code: '52.03', name: 'Kabupaten Lombok Timur', latitude: -8.55, longitude: 116.55 },
	{ code: '52.04', name: 'Kabupaten Sumbawa', latitude: -8.55, longitude: 117.45 },
	{ code: '52.05', name: 'Kabupaten Dompu', latitude: -8.5, longitude: 118.45 },
	{ code: '52.06', name: 'Kabupaten Bima', latitude: -8.55, longitude: 118.75 },
	{ code: '52.07', name: 'Kabupaten Sumbawa Barat', latitude: -8.75, longitude: 116.85 },
	{ code: '52.08', name: 'Kabupaten Lombok Utara', latitude: -8.35, longitude: 116.25 },
	{ code: '52.71', name: 'Kota Mataram', latitude: -8.58, longitude: 116.12 },
	{ code: '52.72', name: 'Kota Bima', latitude: -8.46, longitude: 118.72 },

	// Nusa Tenggara Timur (53)
	{ code: '53.01', name: 'Kabupaten Kupang', latitude: -10.05, longitude: 123.75 },
	{ code: '53.02', name: 'Kabupaten Timor Tengah Selatan', latitude: -9.85, longitude: 124.55 },
	{ code: '53.03', name: 'Kabupaten Timor Tengah Utara', latitude: -9.45, longitude: 124.6 },
	{ code: '53.04', name: 'Kabupaten Belu', latitude: -9.15, longitude: 124.95 },
	{ code: '53.05', name: 'Kabupaten Alor', latitude: -8.3, longitude: 124.55 },
	{ code: '53.06', name: 'Kabupaten Flores Timur', latitude: -8.35, longitude: 123.05 },
	{ code: '53.07', name: 'Kabupaten Sikka', latitude: -8.6, longitude: 122.25 },
	{ code: '53.08', name: 'Kabupaten Ende', latitude: -8.75, longitude: 121.65 },
	{ code: '53.09', name: 'Kabupaten Ngada', latitude: -8.75, longitude: 121.05 },
	{ code: '53.10', name: 'Kabupaten Manggarai', latitude: -8.65, longitude: 120.45 },
	{ code: '53.11', name: 'Kabupaten Sumba Timur', latitude: -9.85, longitude: 120.25 },
	{ code: '53.12', name: 'Kabupaten Sumba Barat', latitude: -9.55, longitude: 119.4 },
	{ code: '53.13', name: 'Kabupaten Lembata', latitude: -8.4, longitude: 123.45 },
	{ code: '53.14', name: 'Kabupaten Rote Ndao', latitude: -10.75, longitude: 123.05 },
	{ code: '53.15', name: 'Kabupaten Manggarai Barat', latitude: -8.65, longitude: 119.9 },
	{ code: '53.16', name: 'Kabupaten Nagekeo', latitude: -8.65, longitude: 121.25 },
	{ code: '53.17', name: 'Kabupaten Sumba Tengah', latitude: -9.5, longitude: 119.7 },
	{ code: '53.18', name: 'Kabupaten Sumba Barat Daya', latitude: -9.6, longitude: 119.05 },
	{ code: '53.19', name: 'Kabupaten Manggarai Timur', latitude: -8.55, longitude: 120.75 },
	{ code: '53.20', name: 'Kabupaten Sabu Raijua', latitude: -10.55, longitude: 121.85 },
	{ code: '53.21', name: 'Kabupaten Malaka', latitude: -9.5, longitude: 124.85 },
	{ code: '53.71', name: 'Kota Kupang', latitude: -10.17, longitude: 123.6 },

	// Kalimantan Barat (61)
	{ code: '61.01', name: 'Kabupaten Sambas', latitude: 1.35, longitude: 109.3 },
	{ code: '61.02', name: 'Kabupaten Bengkayang', latitude: 0.85, longitude: 109.5 },
	{ code: '61.03', name: 'Kabupaten Landak', latitude: 0.35, longitude: 109.55 },
	{ code: '61.04', name: 'Kabupaten Mempawah', latitude: 0.35, longitude: 109.0 },
	{ code: '61.05', name: 'Kabupaten Sanggau', latitude: 0.15, longitude: 110.55 },
	{ code: '61.06', name: 'Kabupaten Ketapang', latitude: -1.85, longitude: 110.05 },
	{ code: '61.07', name: 'Kabupaten Sintang', latitude: 0.05, longitude: 111.5 },
	{ code: '61.08', name: 'Kabupaten Kapuas Hulu', latitude: 0.85, longitude: 112.95 },
	{ code: '61.09', name: 'Kabupaten Sekadau', latitude: 0.05, longitude: 110.95 },
	{ code: '61.10', name: 'Kabupaten Melawi', latitude: -0.35, longitude: 111.7 },
	{ code: '61.11', name: 'Kabupaten Kayong Utara', latitude: -1.25, longitude: 109.95 },
	{ code: '61.12', name: 'Kabupaten Kubu Raya', latitude: -0.15, longitude: 109.35 },
	{ code: '61.71', name: 'Kota Pontianak', latitude: -0.02, longitude: 109.34 },
	{ code: '61.72', name: 'Kota Singkawang', latitude: 0.9, longitude: 108.98 },

	// Kalimantan Tengah (62)
	{ code: '62.01', name: 'Kabupaten Kotawaringin Barat', latitude: -2.35, longitude: 111.65 },
	{ code: '62.02', name: 'Kabupaten Kotawaringin Timur', latitude: -2.35, longitude: 112.75 },
	{ code: '62.03', name: 'Kabupaten Kapuas', latitude: -2.35, longitude: 114.35 },
	{ code: '62.04', name: 'Kabupaten Barito Selatan', latitude: -1.85, longitude: 114.75 },
	{ code: '62.05', name: 'Kabupaten Barito Utara', latitude: -1.05, longitude: 115.05 },
	{ code: '62.06', name: 'Kabupaten Katingan', latitude: -1.85, longitude: 113.35 },
	{ code: '62.07', name: 'Kabupaten Seruyan', latitude: -2.35, longitude: 112.25 },
	{ code: '62.08', name: 'Kabupaten Sukamara', latitude: -2.65, longitude: 111.15 },
	{ code: '62.09', name: 'Kabupaten Lamandau', latitude: -1.85, longitude: 111.35 },
	{ code: '62.10', name: 'Kabupaten Gunung Mas', latitude: -1.05, longitude: 113.55 },
	{ code: '62.11', name: 'Kabupaten Pulang Pisau', latitude: -2.75, longitude: 114.25 },
	{ code: '62.12', name: 'Kabupaten Murung Raya', latitude: -0.35, longitude: 114.35 },
	{ code: '62.13', name: 'Kabupaten Barito Timur', latitude: -1.85, longitude: 115.35 },
	{ code: '62.71', name: 'Kota Palangka Raya', latitude: -2.21, longitude: 113.92 },

	// Kalimantan Selatan (63)
	{ code: '63.01', name: 'Kabupaten Tanah Laut', latitude: -3.75, longitude: 114.65 },
	{ code: '63.02', name: 'Kabupaten Kota Baru', latitude: -3.25, longitude: 116.15 },
	{ code: '63.03', name: 'Kabupaten Banjar', latitude: -3.35, longitude: 114.95 },
	{ code: '63.04', name: 'Kabupaten Barito Kuala', latitude: -3.05, longitude: 114.55 },
	{ code: '63.05', name: 'Kabupaten Tapin', latitude: -2.85, longitude: 115.05 },
	{ code: '63.06', name: 'Kabupaten Hulu Sungai Selatan', latitude: -2.75, longitude: 115.25 },
	{ code: '63.07', name: 'Kabupaten Hulu Sungai Tengah', latitude: -2.55, longitude: 115.35 },
	{ code: '63.08', name: 'Kabupaten Hulu Sungai Utara', latitude: -2.35, longitude: 115.15 },
	{ code: '63.09', name: 'Kabupaten Tabalong', latitude: -1.85, longitude: 115.45 },
	{ code: '63.10', name: 'Kabupaten Tanah Bumbu', latitude: -3.55, longitude: 115.75 },
	{ code: '63.11', name: 'Kabupaten Balangan', latitude: -2.35, longitude: 115.6 },
	{ code: '63.71', name: 'Kota Banjarmasin', latitude: -3.32, longitude: 114.59 },
	{ code: '63.72', name: 'Kota Banjarbaru', latitude: -3.44, longitude: 114.83 },

	// Kalimantan Timur (64)
	{ code: '64.01', name: 'Kabupaten Paser', latitude: -1.85, longitude: 116.15 },
	{ code: '64.02', name: 'Kabupaten Kutai Kartanegara', latitude: -0.35, longitude: 116.65 },
	{ code: '64.03', name: 'Kabupaten Berau', latitude: 1.85, longitude: 117.35 },
	{ code: '64.07', name: 'Kabupaten Kutai Barat', latitude: -0.35, longitude: 115.85 },
	{ code: '64.08', name: 'Kabupaten Kutai Timur', latitude: 0.85, longitude: 117.35 },
	{ code: '64.09', name: 'Kabupaten Penajam Paser Utara', latitude: -1.15, longitude: 116.55 },
	{ code: '64.11', name: 'Kabupaten Mahakam Ulu', latitude: 0.55, longitude: 115.15 },
	{ code: '64.71', name: 'Kota Balikpapan', latitude: -1.27, longitude: 116.83 },
	{ code: '64.72', name: 'Kota Samarinda', latitude: -0.5, longitude: 117.15 },
	{ code: '64.73', name: 'Kota Bontang', latitude: 0.13, longitude: 117.5 },

	// Kalimantan Utara (65)
	{ code: '65.01', name: 'Kabupaten Bulungan', latitude: 2.85, longitude: 117.35 },
	{ code: '65.02', name: 'Kabupaten Malinau', latitude: 2.55, longitude: 115.85 },
	{ code: '65.03', name: 'Kabupaten Nunukan', latitude: 4.05, longitude: 117.05 },
	{ code: '65.04', name: 'Kabupaten Tana Tidung', latitude: 3.55, longitude: 117.25 },
	{ code: '65.71', name: 'Kota Tarakan', latitude: 3.3, longitude: 117.59 },

	// Sulawesi Utara (71)
	{ code: '71.01', name: 'Kabupaten Bolaang Mongondow', latitude: 0.65, longitude: 124.15 },
	{ code: '71.02', name: 'Kabupaten Minahasa', latitude: 1.15, longitude: 124.85 },
	{ code: '71.03', name: 'Kabupaten Kepulauan Sangihe', latitude: 3.55, longitude: 125.55 },
	{ code: '71.04', name: 'Kabupaten Kepulauan Talaud', latitude: 4.25, longitude: 126.75 },
	{ code: '71.05', name: 'Kabupaten Minahasa Selatan', latitude: 1.05, longitude: 124.55 },
	{ code: '71.06', name: 'Kabupaten Minahasa Utara', latitude: 1.45, longitude: 125.05 },
	{ code: '71.07', name: 'Kabupaten Minahasa Tenggara', latitude: 1.05, longitude: 124.75 },
	{ code: '71.08', name: 'Kabupaten Bolaang Mongondow Utara', latitude: 0.85, longitude: 123.55 },
	{ code: '71.09', name: 'Kabupaten Kepulauan Siau Tagulandang Biaro', latitude: 2.65, longitude: 125.4 },
	{ code: '71.10', name: 'Kabupaten Bolaang Mongondow Timur', latitude: 0.75, longitude: 124.55 },
	{ code: '71.11', name: 'Kabupaten Bolaang Mongondow Selatan', latitude: 0.35, longitude: 123.85 },
	{ code: '71.71', name: 'Kota Manado', latitude: 1.47, longitude: 124.84 },
	{ code: '71.72', name: 'Kota Bitung', latitude: 1.44, longitude: 125.19 },
	{ code: '71.73', name: 'Kota Tomohon', latitude: 1.32, longitude: 124.84 },
	{ code: '71.74', name: 'Kota Kotamobagu', latitude: 0.73, longitude: 124.32 },

	// Gorontalo (75)
	{ code: '75.01', name: 'Kabupaten Gorontalo', latitude: 0.55, longitude: 122.85 },
	{ code: '75.02', name: 'Kabupaten Boalemo', latitude: 0.55, longitude: 122.25 },
	{ code: '75.03', name: 'Kabupaten Bone Bolango', latitude: 0.45, longitude: 123.15 },
	{ code: '75.04', name: 'Kabupaten Pahuwato', latitude: 0.55, longitude: 121.75 },
	{ code: '75.05', name: 'Kabupaten Gorontalo Utara', latitude: 0.85, longitude: 122.55 },
	{ code: '75.71', name: 'Kota Gorontalo', latitude: 0.53, longitude: 123.06 },

	// Sulawesi Tengah (72)
	{ code: '72.01', name: 'Kabupaten Banggai', latitude: -1.35, longitude: 122.85 },
	{ code: '72.02', name: 'Kabupaten Poso', latitude: -1.65, longitude: 120.75 },
	{ code: '72.03', name: 'Kabupaten Donggala', latitude: -0.65, longitude: 119.75 },
	{ code: '72.04', name: 'Kabupaten Toli-Toli', latitude: 1.05, longitude: 120.75 },
	{ code: '72.05', name: 'Kabupaten Buol', latitude: 1.05, longitude: 121.35 },
	{ code: '72.06', name: 'Kabupaten Morowali', latitude: -1.85, longitude: 121.65 },
	{ code: '72.07', name: 'Kabupaten Banggai Kepulauan', latitude: -1.35, longitude: 123.25 },
	{ code: '72.08', name: 'Kabupaten Parigi Moutong', latitude: -0.55, longitude: 120.55 },
	{ code: '72.09', name: 'Kabupaten Tojo Una-Una', latitude: -1.15, longitude: 121.55 },
	{ code: '72.10', name: 'Kabupaten Sigi', latitude: -1.05, longitude: 119.95 },
	{ code: '72.11', name: 'Kabupaten Banggai Laut', latitude: -1.65, longitude: 123.5 },
	{ code: '72.12', name: 'Kabupaten Morowali Utara', latitude: -1.35, longitude: 121.05 },
	{ code: '72.71', name: 'Kota Palu', latitude: -0.9, longitude: 119.87 },

	// Sulawesi Barat (76)
	{ code: '76.01', name: 'Kabupaten Majene', latitude: -3.15, longitude: 118.85 },
	{ code: '76.02', name: 'Kabupaten Polewali Mandar', latitude: -3.35, longitude: 119.15 },
	{ code: '76.03', name: 'Kabupaten Mamasa', latitude: -2.85, longitude: 119.35 },
	{ code: '76.04', name: 'Kabupaten Mamuju', latitude: -2.55, longitude: 119.35 },
	{ code: '76.05', name: 'Kabupaten Mamuju Utara', latitude: -1.35, longitude: 119.55 },
	{ code: '76.06', name: 'Kabupaten Mamuju Tengah', latitude: -2.25, longitude: 119.75 },

	// Sulawesi Selatan (73)
	{ code: '73.01', name: 'Kabupaten Kepulauan Selayar', latitude: -6.35, longitude: 120.45 },
	{ code: '73.02', name: 'Kabupaten Bulukumba', latitude: -5.45, longitude: 120.25 },
	{ code: '73.03', name: 'Kabupaten Bantaeng', latitude: -5.5, longitude: 119.95 },
	{ code: '73.04', name: 'Kabupaten Jeneponto', latitude: -5.65, longitude: 119.65 },
	{ code: '73.05', name: 'Kabupaten Takalar', latitude: -5.45, longitude: 119.45 },
	{ code: '73.06', name: 'Kabupaten Gowa', latitude: -5.35, longitude: 119.65 },
	{ code: '73.07', name: 'Kabupaten Sinjai', latitude: -5.25, longitude: 120.15 },
	{ code: '73.08', name: 'Kabupaten Bone', latitude: -4.55, longitude: 120.35 },
	{ code: '73.09', name: 'Kabupaten Maros', latitude: -5.05, longitude: 119.55 },
	{ code: '73.10', name: 'Kabupaten Pangkajene dan Kepulauan', latitude: -4.85, longitude: 119.55 },
	{ code: '73.11', name: 'Kabupaten Barru', latitude: -4.45, longitude: 119.65 },
	{ code: '73.12', name: 'Kabupaten Soppeng', latitude: -4.35, longitude: 119.85 },
	{ code: '73.13', name: 'Kabupaten Wajo', latitude: -4.05, longitude: 120.15 },
	{ code: '73.14', name: 'Kabupaten Sidenreng Rappang', latitude: -3.85, longitude: 119.85 },
	{ code: '73.15', name: 'Kabupaten Pinrang', latitude: -3.65, longitude: 119.65 },
	{ code: '73.16', name: 'Kabupaten Enrekang', latitude: -3.55, longitude: 119.85 },
	{ code: '73.17', name: 'Kabupaten Luwu', latitude: -3.35, longitude: 120.25 },
	{ code: '73.18', name: 'Kabupaten Tana Toraja', latitude: -3.05, longitude: 119.85 },
	{ code: '73.19', name: 'Kabupaten Luwu Utara', latitude: -2.55, longitude: 120.35 },
	{ code: '73.20', name: 'Kabupaten Luwu Timur', latitude: -2.55, longitude: 121.05 },
	{ code: '73.21', name: 'Kabupaten Toraja Utara', latitude: -2.85, longitude: 119.95 },
	{ code: '73.71', name: 'Kota Makassar', latitude: -5.15, longitude: 119.43 },
	{ code: '73.72', name: 'Kota Parepare', latitude: -4.01, longitude: 119.63 },
	{ code: '73.73', name: 'Kota Palopo', latitude: -3.0, longitude: 120.2 },

	// Sulawesi Tenggara (74)
	{ code: '74.01', name: 'Kabupaten Kolaka', latitude: -4.05, longitude: 121.55 },
	{ code: '74.02', name: 'Kabupaten Konawe', latitude: -3.85, longitude: 122.05 },
	{ code: '74.03', name: 'Kabupaten Muna', latitude: -4.85, longitude: 122.65 },
	{ code: '74.04', name: 'Kabupaten Buton', latitude: -5.05, longitude: 122.75 },
	{ code: '74.05', name: 'Kabupaten Konawe Selatan', latitude: -4.35, longitude: 122.35 },
	{ code: '74.06', name: 'Kabupaten Bombana', latitude: -4.85, longitude: 122.05 },
	{ code: '74.07', name: 'Kabupaten Wakatobi', latitude: -5.35, longitude: 123.55 },
	{ code: '74.08', name: 'Kabupaten Kolaka Utara', latitude: -3.45, longitude: 121.05 },
	{ code: '74.09', name: 'Kabupaten Konawe Utara', latitude: -3.45, longitude: 122.05 },
	{ code: '74.10', name: 'Kabupaten Buton Utara', latitude: -4.85, longitude: 123.05 },
	{ code: '74.11', name: 'Kabupaten Kolaka Timur', latitude: -4.05, longitude: 121.85 },
	{ code: '74.12', name: 'Kabupaten Konawe Kepulauan', latitude: -4.05, longitude: 122.85 },
	{ code: '74.13', name: 'Kabupaten Muna Barat', latitude: -4.85, longitude: 122.35 },
	{ code: '74.14', name: 'Kabupaten Buton Tengah', latitude: -5.15, longitude: 122.5 },
	{ code: '74.15', name: 'Kabupaten Buton Selatan', latitude: -5.35, longitude: 122.55 },
	{ code: '74.71', name: 'Kota Kendari', latitude: -3.97, longitude: 122.51 },
	{ code: '74.72', name: 'Kota Baubau', latitude: -5.47, longitude: 122.62 },

	// Maluku (81)
	{ code: '81.01', name: 'Kabupaten Maluku Tengah', latitude: -3.35, longitude: 128.95 },
	{ code: '81.02', name: 'Kabupaten Maluku Tenggara', latitude: -5.65, longitude: 132.75 },
	{ code: '81.03', name: 'Kabupaten Maluku Tenggara Barat', latitude: -7.0, longitude: 131.35 },
	{ code: '81.04', name: 'Kabupaten Buru', latitude: -3.35, longitude: 126.65 },
	{ code: '81.05', name: 'Kabupaten Seram Bagian Timur', latitude: -3.35, longitude: 130.35 },
	{ code: '81.06', name: 'Kabupaten Seram Bagian Barat', latitude: -3.15, longitude: 128.35 },
	{ code: '81.07', name: 'Kabupaten Kepulauan Aru', latitude: -6.15, longitude: 134.35 },
	{ code: '81.08', name: 'Kabupaten Maluku Barat Daya', latitude: -7.75, longitude: 127.75 },
	{ code: '81.09', name: 'Kabupaten Buru Selatan', latitude: -3.55, longitude: 126.35 },
	{ code: '81.71', name: 'Kota Ambon', latitude: -3.69, longitude: 128.18 },
	{ code: '81.72', name: 'Kota Tual', latitude: -5.63, longitude: 132.75 },

	// Maluku Utara (82)
	{ code: '82.01', name: 'Kabupaten Halmahera Barat', latitude: 1.05, longitude: 127.55 },
	{ code: '82.02', name: 'Kabupaten Halmahera Tengah', latitude: 0.55, longitude: 128.35 },
	{ code: '82.03', name: 'Kabupaten Halmahera Utara', latitude: 1.55, longitude: 128.05 },
	{ code: '82.04', name: 'Kabupaten Halmahera Selatan', latitude: -0.65, longitude: 127.85 },
	{ code: '82.05', name: 'Kabupaten Kepulauan Sula', latitude: -2.05, longitude: 125.85 },
	{ code: '82.06', name: 'Kabupaten Halmahera Timur', latitude: 1.05, longitude: 128.65 },
	{ code: '82.07', name: 'Kabupaten Pulau Morotai', latitude: 2.35, longitude: 128.45 },
	{ code: '82.08', name: 'Kabupaten Pulau Taliabu', latitude: -1.85, longitude: 124.65 },
	{ code: '82.71', name: 'Kota Ternate', latitude: 0.79, longitude: 127.38 },
	{ code: '82.72', name: 'Kota Tidore Kepulauan', latitude: 0.65, longitude: 127.45 },

	// Papua Barat (92)
	{ code: '92.01', name: 'Kabupaten Sorong', latitude: -0.85, longitude: 131.25 },
	{ code: '92.02', name: 'Kabupaten Manokwari', latitude: -0.85, longitude: 134.05 },
	{ code: '92.03', name: 'Kabupaten Fakfak', latitude: -2.95, longitude: 132.35 },
	{ code: '92.04', name: 'Kabupaten Sorong Selatan', latitude: -1.55, longitude: 132.05 },
	{ code: '92.05', name: 'Kabupaten Raja Ampat', latitude: -0.55, longitude: 130.05 },
	{ code: '92.06', name: 'Kabupaten Teluk Bintuni', latitude: -2.05, longitude: 133.35 },
	{ code: '92.07', name: 'Kabupaten Teluk Wondama', latitude: -2.55, longitude: 134.35 },
	{ code: '92.08', name: 'Kabupaten Kaimana', latitude: -3.55, longitude: 133.75 },
	{ code: '92.09', name: 'Kabupaten Manokwari Selatan', latitude: -1.35, longitude: 133.65 },
	{ code: '92.10', name: 'Kabupaten Pegunungan Arfak', latitude: -1.25, longitude: 133.95 },
	{ code: '92.71', name: 'Kota Sorong', latitude: -0.88, longitude: 131.26 },

	// Papua (91)
	{ code: '91.01', name: 'Kabupaten Merauke', latitude: -8.45, longitude: 140.35 },
	{ code: '91.02', name: 'Kabupaten Jayawijaya', latitude: -4.05, longitude: 138.95 },
	{ code: '91.03', name: 'Kabupaten Jayapura', latitude: -2.65, longitude: 140.45 },
	{ code: '91.04', name: 'Kabupaten Nabire', latitude: -3.35, longitude: 135.55 },
	{ code: '91.05', name: 'Kabupaten Kepulauan Yapen', latitude: -1.85, longitude: 136.25 },
	{ code: '91.06', name: 'Kabupaten Biak Numfor', latitude: -1.05, longitude: 135.95 },
	{ code: '91.07', name: 'Kabupaten Paniai', latitude: -3.85, longitude: 136.35 },
	{ code: '91.08', name: 'Kabupaten Puncak Jaya', latitude: -3.65, longitude: 137.85 },
	{ code: '91.09', name: 'Kabupaten Mimika', latitude: -4.55, longitude: 136.85 },
	{ code: '91.10', name: 'Kabupaten Sarmi', latitude: -2.05, longitude: 138.75 },
	{ code: '91.11', name: 'Kabupaten Keerom', latitude: -3.05, longitude: 140.85 },
	{ code: '91.12', name: 'Kabupaten Pegunungan Bintang', latitude: -4.55, longitude: 140.35 },
	{ code: '91.13', name: 'Kabupaten Yahukimo', latitude: -4.55, longitude: 139.35 },
	{ code: '91.14', name: 'Kabupaten Tolikara', latitude: -3.55, longitude: 138.35 },
	{ code: '91.15', name: 'Kabupaten Waropen', latitude: -2.55, longitude: 136.65 },
	{ code: '91.16', name: 'Kabupaten Boven Digoel', latitude: -5.75, longitude: 140.35 },
	{ code: '91.17', name: 'Kabupaten Mappi', latitude: -6.35, longitude: 139.55 },
	{ code: '91.18', name: 'Kabupaten Asmat', latitude: -5.35, longitude: 138.35 },
	{ code: '91.19', name: 'Kabupaten Supiori', latitude: -0.75, longitude: 135.65 },
	{ code: '91.20', name: 'Kabupaten Mamberamo Raya', latitude: -2.35, longitude: 137.85 },
	{ code: '91.21', name: 'Kabupaten Mamberamo Tengah', latitude: -3.55, longitude: 138.65 },
	{ code: '91.22', name: 'Kabupaten Yalimo', latitude: -3.85, longitude: 139.45 },
	{ code: '91.23', name: 'Kabupaten Lanny Jaya', latitude: -3.95, longitude: 138.35 },
	{ code: '91.24', name: 'Kabupaten Nduga', latitude: -4.45, longitude: 138.15 },
	{ code: '91.25', name: 'Kabupaten Puncak', latitude: -3.95, longitude: 137.35 },
	{ code: '91.26', name: 'Kabupaten Dogiyai', latitude: -4.05, longitude: 135.75 },
	{ code: '91.27', name: 'Kabupaten Intan Jaya', latitude: -3.55, longitude: 136.85 },
	{ code: '91.28', name: 'Kabupaten Deiyai', latitude: -4.15, longitude: 136.35 },
	{ code: '91.71', name: 'Kota Jayapura', latitude: -2.53, longitude: 140.71 }
];

/** Finds a regency by its exact adm2 code. */
export function findRegencyByCode(code: string): RegencyEntry | undefined {
	return REGENCIES.find((r) => r.code === code);
}

/** All regencies belonging to a province code. */
export function regenciesOfProvince(provinceCode: string): RegencyEntry[] {
	const prefix = `${provinceCode}.`;
	return REGENCIES.filter((r) => r.code.startsWith(prefix));
}
