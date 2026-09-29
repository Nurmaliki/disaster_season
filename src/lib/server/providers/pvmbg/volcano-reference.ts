import type { VolcanoReference }  from '$lib/server/providers/pvmbg/volcano';

/**
 * Coordinate reference for Indonesian volcanoes monitored by PVMBG.
 * Coordinates are from PVMBG/BIG published catalogue values (WGS84, decimal degrees).
 *
 * This list exists because MAGMA's activity table publishes names but not
 * coordinates. Any volcano in the feed that is absent here is still surfaced in
 * the UI; it simply has no map marker, and the UI says so.
 */
export const VOLCANO_REFERENCES: VolcanoReference[] = [
	{ name: 'Sinabung', latitude: 3.17, longitude: 98.392, elevationM: 2460, province: 'Sumatera Utara', type: 'stratovolcano' },
	{ name: 'Sibayak', latitude: 3.233, longitude: 98.516, elevationM: 2212, province: 'Sumatera Utara', type: 'stratovolcano' },
	{ name: 'Toba', latitude: 2.58, longitude: 98.83, elevationM: 2157, province: 'Sumatera Utara', type: 'caldera' },
	{ name: 'Marapi', latitude: -0.381, longitude: 100.473, elevationM: 2891, province: 'Sumatera Barat', type: 'complex' },
	{ name: 'Talang', latitude: -0.978, longitude: 100.68, elevationM: 2597, province: 'Sumatera Barat', type: 'stratovolcano' },
	{ name: 'Kerinci', latitude: -1.697, longitude: 101.264, elevationM: 3805, province: 'Jambi', type: 'stratovolcano' },
	{ name: 'Dempo', latitude: -4.017, longitude: 103.133, elevationM: 3173, province: 'Sumatera Selatan', type: 'stratovolcano' },
	{ name: 'Krakatau', aliases: ['Anak Krakatau', 'Krakatau, Anak'], latitude: -6.102, longitude: 105.423, elevationM: 157, province: 'Lampung', type: 'caldera' },
	{ name: 'Pesawaran', latitude: -5.42, longitude: 105.3, elevationM: 1150, province: 'Lampung', type: 'stratovolcano' },
	{ name: 'Salak', latitude: -6.72, longitude: 106.733, elevationM: 2211, province: 'Jawa Barat', type: 'stratovolcano' },
	{ name: 'Gede', latitude: -6.78, longitude: 106.983, elevationM: 2958, province: 'Jawa Barat', type: 'stratovolcano' },
	{ name: 'Tangkuban Parahu', aliases: ['Tangkubanparahu'], latitude: -6.77, longitude: 107.6, elevationM: 2084, province: 'Jawa Barat', type: 'stratovolcano' },
	{ name: 'Papandayan', latitude: -7.32, longitude: 107.73, elevationM: 2665, province: 'Jawa Barat', type: 'stratovolcano' },
	{ name: 'Galunggung', latitude: -7.25, longitude: 108.058, elevationM: 2168, province: 'Jawa Barat', type: 'stratovolcano' },
	{ name: 'Ceremai', aliases: ['Ciremai', 'Ciremai, Gunung'], latitude: -6.892, longitude: 108.4, elevationM: 3078, province: 'Jawa Barat', type: 'stratovolcano' },
	{ name: 'Slamet', latitude: -7.242, longitude: 109.208, elevationM: 3428, province: 'Jawa Tengah', type: 'stratovolcano' },
	{ name: 'Sumbing', latitude: -7.384, longitude: 110.07, elevationM: 3371, province: 'Jawa Tengah', type: 'stratovolcano' },
	{ name: 'Sindoro', latitude: -7.3, longitude: 109.99, elevationM: 3136, province: 'Jawa Tengah', type: 'stratovolcano' },
	{ name: 'Merbabu', latitude: -7.454, longitude: 110.44, elevationM: 3145, province: 'Jawa Tengah', type: 'stratovolcano' },
	{ name: 'Merapi', latitude: -7.54, longitude: 110.446, elevationM: 2968, province: 'Daerah Istimewa Yogyakarta dan Jawa Tengah', type: 'stratovolcano' },
	{ name: 'Lawu', latitude: -7.625, longitude: 111.19, elevationM: 3265, province: 'Jawa Tengah', type: 'stratovolcano' },
	{ name: 'Kelud', aliases: ['Kelut'], latitude: -7.93, longitude: 112.308, elevationM: 1731, province: 'Jawa Timur', type: 'stratovolcano' },
	{ name: 'Arjuno-Welirang', aliases: ['Arjuno', 'Welirang'], latitude: -7.725, longitude: 112.58, elevationM: 3339, province: 'Jawa Timur', type: 'complex' },
	{ name: 'Penanggungan', latitude: -7.615, longitude: 112.62, elevationM: 1653, province: 'Jawa Timur', type: 'stratovolcano' },
	{ name: 'Semeru', latitude: -8.108, longitude: 112.922, elevationM: 3676, province: 'Jawa Timur', type: 'stratovolcano' },
	{ name: 'Bromo', latitude: -7.942, longitude: 112.953, elevationM: 2329, province: 'Jawa Timur', type: 'caldera' },
	{ name: 'Raung', latitude: -8.125, longitude: 114.042, elevationM: 3332, province: 'Jawa Timur', type: 'stratovolcano' },
	{ name: 'Ijen', latitude: -8.058, longitude: 114.242, elevationM: 2386, province: 'Jawa Timur', type: 'stratovolcano' },
	{ name: 'Batur', latitude: -8.242, longitude: 115.375, elevationM: 1717, province: 'Bali', type: 'caldera' },
	{ name: 'Agung', latitude: -8.343, longitude: 115.508, elevationM: 3031, province: 'Bali', type: 'stratovolcano' },
	{ name: 'Rinjani', latitude: -8.42, longitude: 116.47, elevationM: 3726, province: 'Nusa Tenggara Barat', type: 'stratovolcano' },
	{ name: 'Tambora', latitude: -8.25, longitude: 118.0, elevationM: 2850, province: 'Nusa Tenggara Barat', type: 'caldera' },
	{ name: 'Sangeang Api', aliases: ['Sangeangapi'], latitude: -8.2, longitude: 119.07, elevationM: 1949, province: 'Nusa Tenggara Barat', type: 'stratovolcano' },
	{ name: 'Rokatenda', aliases: ['Paluweh'], latitude: -8.32, longitude: 121.708, elevationM: 875, province: 'Nusa Tenggara Timur', type: 'stratovolcano' },
	{ name: 'Egon', latitude: -8.67, longitude: 122.45, elevationM: 1703, province: 'Nusa Tenggara Timur', type: 'stratovolcano' },
	{ name: 'Ile Lewotolok', aliases: ['Lewotolo', 'Lewotolok'], latitude: -8.272, longitude: 123.508, elevationM: 1423, province: 'Nusa Tenggara Timur', type: 'stratovolcano' },
	{ name: 'Lewotobi', aliases: ['Lewotobi Laki-Laki', 'Lewotobi Perempuan'], latitude: -8.542, longitude: 122.775, elevationM: 1703, province: 'Nusa Tenggara Timur', type: 'stratovolcano' },
	{ name: 'Soputan', latitude: 1.358, longitude: 124.725, elevationM: 1784, province: 'Sulawesi Utara', type: 'stratovolcano' },
	{ name: 'Lokon', aliases: ['Lokon-Empung'], latitude: 1.358, longitude: 124.792, elevationM: 1580, province: 'Sulawesi Utara', type: 'stratovolcano' },
	{ name: 'Karangetang', aliases: ['Api Siau'], latitude: 2.781, longitude: 125.407, elevationM: 1784, province: 'Sulawesi Utara', type: 'stratovolcano' },
	{ name: 'Awu', latitude: 3.689, longitude: 125.447, elevationM: 1320, province: 'Sulawesi Utara', type: 'stratovolcano' },
	{ name: 'Gamalama', latitude: 0.81, longitude: 127.333, elevationM: 1715, province: 'Maluku Utara', type: 'stratovolcano' },
	{ name: 'Gamkonora', latitude: 1.38, longitude: 127.53, elevationM: 1635, province: 'Maluku Utara', type: 'stratovolcano' },
	{ name: 'Ibu', latitude: 1.488, longitude: 127.63, elevationM: 1325, province: 'Maluku Utara', type: 'stratovolcano' },
	{ name: 'Dukono', latitude: 1.685, longitude: 127.878, elevationM: 1185, province: 'Maluku Utara', type: 'complex' },
	{ name: 'Ternate', latitude: 0.79, longitude: 127.33, elevationM: 1715, province: 'Maluku Utara', type: 'stratovolcano' },
	{ name: 'Banda Api', aliases: ['Bandaapi'], latitude: -4.523, longitude: 129.871, elevationM: 640, province: 'Maluku', type: 'caldera' },
	{ name: 'Serua', latitude: -6.3, longitude: 130.02, elevationM: 641, province: 'Maluku', type: 'stratovolcano' },
	{ name: 'Guntur', latitude: -7.143, longitude: 107.84, elevationM: 2249, province: 'Jawa Barat', type: 'stratovolcano' },
	{ name: 'Talakmau', aliases: ['Talangmau'], latitude: 0.079, longitude: 99.985, elevationM: 2919, province: 'Sumatera Barat', type: 'complex' },
	{ name: 'Gunungapi Wetar', aliases: ['Wetar'], latitude: -6.642, longitude: 126.65, elevationM: 282, province: 'Maluku', type: 'stratovolcano' },
	{ name: 'Nila', latitude: -6.73, longitude: 129.5, elevationM: 781, province: 'Maluku', type: 'stratovolcano' },
	{ name: 'Teon', latitude: -6.92, longitude: 129.13, elevationM: 655, province: 'Maluku', type: 'stratovolcano' },
	{ name: 'Wurlali', aliases: ['Damar'], latitude: -7.125, longitude: 128.675, elevationM: 868, province: 'Maluku', type: 'stratovolcano' },
	{ name: 'Sangeangapi', latitude: -8.2, longitude: 119.07, elevationM: 1949, province: 'Nusa Tenggara Barat', type: 'stratovolcano' },
	{ name: 'Kelimutu', latitude: -8.77, longitude: 121.82, elevationM: 1639, province: 'Nusa Tenggara Timur', type: 'complex' },
	{ name: 'Inielika', latitude: -8.73, longitude: 120.98, elevationM: 1559, province: 'Nusa Tenggara Timur', type: 'complex' },
	{ name: 'Inerie', latitude: -8.875, longitude: 120.96, elevationM: 2245, province: 'Nusa Tenggara Timur', type: 'stratovolcano' },
	{ name: 'Iya', latitude: -8.895, longitude: 121.645, elevationM: 637, province: 'Nusa Tenggara Timur', type: 'stratovolcano' },
	{ name: 'Rindjani', aliases: ['Rinjani'], latitude: -8.42, longitude: 116.47, elevationM: 3726, province: 'Nusa Tenggara Barat', type: 'stratovolcano' },
];

function normalizeName(value: string): string {
	return value
		.toLowerCase()
		// strip the "Gunung" prefix/suffix in either position, including the
		// "Semeru, Gunung" comma form used by MAGMA
		.replace(/,\s*gunung\s*$/g, '')
		.replace(/\bgunung\b/g, '')
		.replace(/[^a-z0-9]/g, '')
		.trim();
}

const REFERENCE_INDEX = (() => {
	const index = new Map<string, VolcanoReference>();
	for (const ref of VOLCANO_REFERENCES) {
		index.set(normalizeName(ref.name), ref);
		for (const alias of ref.aliases ?? []) {
			const key = normalizeName(alias);
			if (!index.has(key)) index.set(key, ref);
		}
	}
	return index;
})();

/** Resolves a volcano name from MAGMA to a coordinate reference, if known. */
export function lookupVolcanoReference(name: string): VolcanoReference | null {
	const direct = REFERENCE_INDEX.get(normalizeName(name));
	if (direct) return direct;

	// Handle "Merapi, Gunung" / "Gunung Merapi" style variants.
	const stripped = normalizeName(name.replace(/,\s*gunung$/i, ''));
	const fallback = REFERENCE_INDEX.get(stripped);
	if (fallback) return fallback;

	// Last resort: prefix match on the first significant token.
	for (const [key, ref] of REFERENCE_INDEX) {
		if (key.length >= 4 && (key.startsWith(stripped) || stripped.startsWith(key))) return ref;
	}
	return null;
}
