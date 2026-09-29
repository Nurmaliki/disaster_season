/**
 * Indonesian provinces with official BPS/BIG `Kode Wilayah` codes (adm1)
 * and representative capital coordinates.
 *
 * Coordinates are for map centring only — they are administrative reference
 * points, never hazard data.
 */
export interface Province {
	code: string;
	name: string;
	latitude: number;
	longitude: number;
	/** Indonesian timezone for local-time display. */
	timeZone: 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';
	/** Representative adm4 code used when only province-level weather is needed. */
	capitalAdm4?: string;
}

export const PROVINCES: Province[] = [
	{
		code: '11',
		name: 'Aceh',
		latitude: 5.55,
		longitude: 95.32,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '11.71.01.2001'
	},
	{
		code: '12',
		name: 'Sumatera Utara',
		latitude: 3.58,
		longitude: 98.67,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '12.71.01.1001'
	},
	{
		code: '13',
		name: 'Sumatera Barat',
		latitude: -0.95,
		longitude: 100.35,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '13.71.01.1001'
	},
	{
		code: '14',
		name: 'Riau',
		latitude: 0.53,
		longitude: 101.45,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '14.71.01.1001'
	},
	{
		code: '15',
		name: 'Jambi',
		latitude: -1.61,
		longitude: 103.61,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '15.71.01.1001'
	},
	{
		code: '16',
		name: 'Sumatera Selatan',
		latitude: -2.99,
		longitude: 104.76,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '16.71.01.1001'
	},
	{
		code: '17',
		name: 'Bengkulu',
		latitude: -3.8,
		longitude: 102.26,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '17.71.01.1001'
	},
	{
		code: '18',
		name: 'Lampung',
		latitude: -5.4,
		longitude: 105.26,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '18.71.01.1001'
	},
	{
		code: '19',
		name: 'Kepulauan Bangka Belitung',
		latitude: -2.13,
		longitude: 106.11,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '19.71.01.1001'
	},
	{
		code: '21',
		name: 'Kepulauan Riau',
		latitude: 0.92,
		longitude: 104.45,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '21.72.01.1001'
	},
	{
		code: '31',
		name: 'DKI Jakarta',
		latitude: -6.18,
		longitude: 106.83,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '31.71.01.1001'
	},
	{
		code: '32',
		name: 'Jawa Barat',
		latitude: -6.91,
		longitude: 107.61,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '32.73.01.1001'
	},
	{
		code: '33',
		name: 'Jawa Tengah',
		latitude: -6.99,
		longitude: 110.42,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '33.74.01.1001'
	},
	{
		code: '34',
		name: 'DI Yogyakarta',
		latitude: -7.8,
		longitude: 110.36,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '34.71.01.1001'
	},
	{
		code: '35',
		name: 'Jawa Timur',
		latitude: -7.25,
		longitude: 112.75,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '35.78.01.1001'
	},
	{
		code: '36',
		name: 'Banten',
		latitude: -6.11,
		longitude: 106.15,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '36.73.01.1001'
	},
	{
		code: '51',
		name: 'Bali',
		latitude: -8.65,
		longitude: 115.22,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '51.71.01.1001'
	},
	{
		code: '52',
		name: 'Nusa Tenggara Barat',
		latitude: -8.58,
		longitude: 116.12,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '52.71.01.1001'
	},
	{
		code: '53',
		name: 'Nusa Tenggara Timur',
		latitude: -10.17,
		longitude: 123.6,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '53.71.01.1001'
	},
	{
		code: '61',
		name: 'Kalimantan Barat',
		latitude: -0.02,
		longitude: 109.34,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '61.71.01.1001'
	},
	{
		code: '62',
		name: 'Kalimantan Tengah',
		latitude: -2.21,
		longitude: 113.92,
		timeZone: 'Asia/Jakarta',
		capitalAdm4: '62.71.01.1001'
	},
	{
		code: '63',
		name: 'Kalimantan Selatan',
		latitude: -3.32,
		longitude: 114.59,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '63.71.01.1001'
	},
	{
		code: '64',
		name: 'Kalimantan Timur',
		latitude: -0.5,
		longitude: 117.15,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '64.72.01.1001'
	},
	{
		code: '65',
		name: 'Kalimantan Utara',
		latitude: 3.3,
		longitude: 117.59,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '65.71.01.1001'
	},
	{
		code: '71',
		name: 'Sulawesi Utara',
		latitude: 1.47,
		longitude: 124.84,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '71.71.01.1001'
	},
	{
		code: '72',
		name: 'Sulawesi Tengah',
		latitude: -0.9,
		longitude: 119.87,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '72.71.01.1001'
	},
	{
		code: '73',
		name: 'Sulawesi Selatan',
		latitude: -5.15,
		longitude: 119.43,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '73.71.01.1001'
	},
	{
		code: '74',
		name: 'Sulawesi Tenggara',
		latitude: -3.97,
		longitude: 122.51,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '74.71.01.1001'
	},
	{
		code: '75',
		name: 'Gorontalo',
		latitude: 0.53,
		longitude: 123.06,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '75.71.01.1001'
	},
	{
		code: '76',
		name: 'Sulawesi Barat',
		latitude: -2.55,
		longitude: 119.35,
		timeZone: 'Asia/Makassar',
		capitalAdm4: '76.04.01.1001'
	},
	{
		code: '81',
		name: 'Maluku',
		latitude: -3.69,
		longitude: 128.18,
		timeZone: 'Asia/Jayapura',
		capitalAdm4: '81.71.01.1001'
	},
	{
		code: '82',
		name: 'Maluku Utara',
		latitude: 0.79,
		longitude: 127.38,
		timeZone: 'Asia/Jayapura',
		capitalAdm4: '82.71.01.1001'
	},
	{
		code: '91',
		name: 'Papua',
		latitude: -2.53,
		longitude: 140.71,
		timeZone: 'Asia/Jayapura',
		capitalAdm4: '91.71.01.1001'
	},
	{
		code: '92',
		name: 'Papua Barat',
		latitude: -0.88,
		longitude: 131.26,
		timeZone: 'Asia/Jayapura',
		capitalAdm4: '92.71.01.1001'
	}
];

const PROVINCE_INDEX = new Map(PROVINCES.map((p) => [p.code, p]));

export function findProvince(code: string): Province | undefined {
	return PROVINCE_INDEX.get(code.slice(0, 2));
}
