import { describe, expect, it } from 'vitest';
import { normalizeWeather } from '$lib/server/providers/bmkg/weather-normalizer';
import type { BmkgWeatherPoint, BmkgWeatherResponse } from '$lib/server/providers/bmkg/weather';

function point(overrides: Partial<BmkgWeatherPoint>): BmkgWeatherPoint {
	return {
		datetime: '2026-01-01T00:00:00Z',
		t: 25,
		tcc: 50,
		tp: 0,
		weather: 1,
		weather_desc: 'Cerah',
		weather_desc_en: 'Clear',
		wd_deg: 90,
		wd: 'Timur',
		wd_to: null,
		ws: 10,
		hu: 60,
		vs: 10,
		vs_text: '10 km',
		time_index: '0',
		local_datetime: '2026-01-01T07:00:00+07:00',
		...overrides
	};
}

function payload(points: BmkgWeatherPoint[]): BmkgWeatherResponse {
	return {
		lokasi: {
			adm1: '31',
			adm2: '31.71',
			adm3: '31.71.01',
			adm4: '31.71.01.1001',
			provinsi: 'DKI Jakarta',
			kotkab: 'Jakarta Pusat',
			kecamatan: 'Gambir',
			desa: 'Gambir',
			lon: 106.8,
			lat: -6.17,
			timezone: 'Asia/Jakarta'
		},
		data: [{ cuaca: [points] }]
	};
}

describe('normalizeWeather — humidity', () => {
	it('carries per-slot humidity from the `hu` field', () => {
		const result = normalizeWeather(payload([point({ hu: 78 })]), '2026-01-01T00:00:00Z');
		expect(result.slots[0].humidity).toBe(78);
	});

	it('reports null humidity when `hu` is missing or non-numeric', () => {
		const result = normalizeWeather(
			payload([point({ hu: null }), point({ hu: 55, datetime: '2026-01-01T03:00:00Z' })]),
			'2026-01-01T00:00:00Z'
		);
		expect(result.slots[0].humidity).toBeNull();
		expect(result.slots[1].humidity).toBe(55);
	});

	it('computes daily avg/min/max humidity over one local day', () => {
		const result = normalizeWeather(
			payload([
				point({
					hu: 60,
					datetime: '2026-01-01T00:00:00Z',
					local_datetime: '2026-01-01T07:00:00+07:00'
				}),
				point({
					hu: 80,
					datetime: '2026-01-01T03:00:00Z',
					local_datetime: '2026-01-01T10:00:00+07:00'
				}),
				point({
					hu: 70,
					datetime: '2026-01-01T06:00:00Z',
					local_datetime: '2026-01-01T13:00:00+07:00'
				})
			]),
			'2026-01-01T00:00:00Z'
		);

		expect(result.daily).toHaveLength(1);
		expect(result.daily[0].avgHumidity).toBeCloseTo(70, 5);
		expect(result.daily[0].minHumidity).toBe(60);
		expect(result.daily[0].maxHumidity).toBe(80);
	});

	it('returns null daily humidity when no slot carries a value', () => {
		const result = normalizeWeather(
			payload([point({ hu: null }), point({ hu: null, datetime: '2026-01-01T03:00:00Z' })]),
			'2026-01-01T00:00:00Z'
		);
		expect(result.daily[0].avgHumidity).toBeNull();
		expect(result.daily[0].minHumidity).toBeNull();
		expect(result.daily[0].maxHumidity).toBeNull();
	});
});
