import { describe, expect, it } from 'vitest';
import { isValidAdmCode } from '$lib/server/providers/bmkg/weather';

describe('BMKG adm code validation', () => {
	it('accepts a full adm4 village code (4-digit final segment)', () => {
		expect(isValidAdmCode(4, '31.71.01.1001')).toBe(true);
		expect(isValidAdmCode(4, '11.71.01.2001')).toBe(true);
	});

	it('accepts adm1–adm3 (2-digit segments)', () => {
		expect(isValidAdmCode(1, '31')).toBe(true);
		expect(isValidAdmCode(2, '31.71')).toBe(true);
		expect(isValidAdmCode(3, '31.71.01')).toBe(true);
	});

	it('rejects a code whose segment count does not match the level', () => {
		expect(isValidAdmCode(4, '31.71.01')).toBe(false);
		expect(isValidAdmCode(3, '31.71.01.1001')).toBe(false);
	});

	it('rejects wrong segment widths', () => {
		// adm4's final segment must be 4 digits, not 2.
		expect(isValidAdmCode(4, '31.71.01.10')).toBe(false);
		// adm3 segments are 2 digits each.
		expect(isValidAdmCode(3, '31.71.1')).toBe(false);
	});

	it('rejects non-numeric codes', () => {
		expect(isValidAdmCode(4, 'ab.cd.ef.ghij')).toBe(false);
		expect(isValidAdmCode(1, 'aa')).toBe(false);
	});
});
