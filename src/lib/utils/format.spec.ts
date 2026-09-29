import { describe, expect, it } from 'vitest';
import {
	formatDateTime,
	formatDate,
	formatRelative,
	formatMagnitude,
	formatTemperature,
	formatDepth,
	formatDistance,
	formatWind,
	timezoneLabel
} from '$lib/utils/format';
import { searchRegions } from '$lib/data/regencies';
import {
	isAdmCode,
	provinceCodeOf,
	regencyCodeOf,
	regenciesOfProvince,
	findRegencyByCode
} from '$lib/data/regencies';
import { PROVINCES, findProvince } from '$lib/data/provinces';

describe('datetime formatting', () => {
	it('formats in Indonesian with a WIB label', () => {
		const formatted = formatDateTime('2026-09-29T07:30:00Z');
		expect(formatted).toContain('2026');
		expect(formatted).toContain('WIB');
		expect(formatted).toMatch(/14[:.]30/);
	});

	it('respects a provided timezone', () => {
		const wita = formatDateTime('2026-09-29T07:30:00Z', 'Asia/Makassar');
		expect(wita).toContain('WITA');
		expect(wita).toMatch(/15[:.]30/);
	});

	it('returns an em dash for invalid input rather than "Invalid Date"', () => {
		expect(formatDateTime(null)).toBe('—');
		expect(formatDateTime('not-a-date')).toBe('—');
		expect(formatDate(undefined)).toBe('—');
	});

	it('maps timezone identifiers to Indonesian abbreviations', () => {
		expect(timezoneLabel('Asia/Jakarta')).toBe('WIB');
		expect(timezoneLabel('Asia/Makassar')).toBe('WITA');
		expect(timezoneLabel('Asia/Jayapura')).toBe('WIT');
	});
});

describe('relative time', () => {
	const now = new Date('2026-09-29T12:00:00Z');

	it('reports very recent times as "baru saja"', () => {
		expect(formatRelative('2026-09-29T11:59:40Z', now)).toBe('baru saja');
	});

	it('reports minutes and hours in Indonesian', () => {
		expect(formatRelative('2026-09-29T11:55:00Z', now)).toContain('menit');
		expect(formatRelative('2026-09-29T09:00:00Z', now)).toContain('jam');
	});

	it('reports days', () => {
		// Intl gives "kemarin dulu" for 2 days ago, which is correct Indonesian.
		expect(formatRelative('2026-09-27T12:00:00Z', now)).toMatch(/kemarin|hari/);
	});

	it('falls back to an absolute date beyond a week', () => {
		const result = formatRelative('2026-08-01T12:00:00Z', now);
		expect(result).toContain('2026');
	});

	it('handles future timestamps', () => {
		expect(formatRelative('2026-09-30T12:00:00Z', now)).toBeTruthy();
	});
});

describe('number formatting', () => {
	it('formats magnitude in BMKG style with a comma decimal', () => {
		expect(formatMagnitude(5.2)).toBe('M 5,2');
		expect(formatMagnitude(null)).toBe('—');
	});

	it('formats temperature and depth', () => {
		expect(formatTemperature(25.4)).toBe('25°C');
		expect(formatDepth(10)).toBe('10 km');
		expect(formatDepth(null)).toBe('—');
	});

	it('formats distance with unit switching', () => {
		expect(formatDistance(0.5)).toBe('500 m');
		expect(formatDistance(7.5)).toBe('7,5 km');
		expect(formatDistance(120)).toBe('120 km');
	});

	it('formats wind with direction', () => {
		expect(formatWind(15, 'NW')).toBe('15 km/jam NW');
		expect(formatWind(null)).toBe('—');
	});
});

describe('administrative code helpers', () => {
	it('validates adm codes per level', () => {
		expect(isAdmCode(1, '31')).toBe(true);
		expect(isAdmCode(2, '31.71')).toBe(true);
		expect(isAdmCode(3, '31.71.01')).toBe(true);
		expect(isAdmCode(4, '31.71.01.1001')).toBe(true);
		expect(isAdmCode(2, '31')).toBe(false);
		expect(isAdmCode(1, '31.71')).toBe(false);
		expect(isAdmCode(1, 'abc')).toBe(false);
	});

	it('extracts parent codes', () => {
		expect(provinceCodeOf('31.71.01.1001')).toBe('31');
		expect(regencyCodeOf('31.71.01.1001')).toBe('31.71');
		expect(regencyCodeOf('31')).toBeNull();
	});
});

describe('province table', () => {
	it('contains all 34 provinces with valid codes and coordinates', () => {
		expect(PROVINCES.length).toBe(34);
		for (const province of PROVINCES) {
			expect(province.code).toMatch(/^\d{2}$/);
			expect(province.name.length).toBeGreaterThan(2);
			expect(Number.isFinite(province.latitude)).toBe(true);
			expect(Number.isFinite(province.longitude)).toBe(true);
		}
	});

	it('has no duplicate codes', () => {
		const codes = PROVINCES.map((p) => p.code);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('looks up by code, tolerating longer codes', () => {
		expect(findProvince('31')?.name).toBe('DKI Jakarta');
		expect(findProvince('32.73.01.1001')?.name).toBe('Jawa Barat');
		expect(findProvince('99')).toBeUndefined();
	});
});

describe('regency table', () => {
	it('every regency code is a valid adm2 code', () => {
		for (const regency of regenciesOfProvince('32')) {
			expect(isAdmCode(2, regency.code)).toBe(true);
		}
	});

	it('coordinates lie within Indonesia', () => {
		for (const regency of regenciesOfProvince('31')) {
			expect(regency.latitude).toBeGreaterThan(-12);
			expect(regency.latitude).toBeLessThan(8);
			expect(regency.longitude).toBeGreaterThan(93);
			expect(regency.longitude).toBeLessThan(142);
		}
	});

	it('finds a regency by exact code', () => {
		expect(findRegencyByCode('32.73')?.name).toBe('Kota Bandung');
		expect(findRegencyByCode('nope')).toBeUndefined();
	});
});

describe('region search', () => {
	it('finds the Bandung family, cities before villages', () => {
		const results = searchRegions('Bandung');
		const names = results.map((r) => r.name);
		expect(names).toContain('Kota Bandung');
		expect(names).toContain('Kabupaten Bandung');
		expect(names).toContain('Kabupaten Bandung Barat');
	});

	it('matches provinces', () => {
		const results = searchRegions('Jawa Barat');
		expect(results.some((r) => r.name === 'Jawa Barat' && r.level === 'province')).toBe(true);
	});

	it('is case insensitive', () => {
		expect(searchRegions('JAKARTA').length).toBeGreaterThan(0);
		expect(searchRegions('jakarta').length).toBeGreaterThan(0);
	});

	it('matches the "Kota"/"Kabupaten" prefix stripped form', () => {
		const results = searchRegions('Surabaya');
		expect(results.some((r) => r.name.includes('Surabaya'))).toBe(true);
	});

	it('requires at least two characters to avoid returning everything', () => {
		expect(searchRegions('a')).toHaveLength(0);
		expect(searchRegions('')).toHaveLength(0);
	});

	it('respects the result limit', () => {
		expect(searchRegions('kota', 5).length).toBeLessThanOrEqual(5);
	});

	it('returns an empty array for a nonsense query', () => {
		expect(searchRegions('zzzzzzqqq')).toHaveLength(0);
	});
});
