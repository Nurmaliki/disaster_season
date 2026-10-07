import { describe, expect, it } from 'vitest';
import {
	HUMIDITY_BANDS,
	classifyHumidity,
	humidityLabel,
	isHumidityNotable
} from '$lib/utils/humidity';

describe('humidity classification', () => {
	it('maps values into the documented bands', () => {
		expect(classifyHumidity(10)?.level).toBe('very_dry');
		expect(classifyHumidity(30)?.level).toBe('dry');
		expect(classifyHumidity(44)?.level).toBe('dry');
		expect(classifyHumidity(45)?.level).toBe('comfortable');
		expect(classifyHumidity(64)?.level).toBe('comfortable');
		expect(classifyHumidity(65)?.level).toBe('humid');
		expect(classifyHumidity(79)?.level).toBe('humid');
		expect(classifyHumidity(80)?.level).toBe('very_humid');
		expect(classifyHumidity(100)?.level).toBe('very_humid');
	});

	it('returns null for missing or non-finite values', () => {
		expect(classifyHumidity(null)).toBeNull();
		expect(classifyHumidity(undefined)).toBeNull();
		expect(classifyHumidity(Number.NaN)).toBeNull();
		expect(classifyHumidity(Number.POSITIVE_INFINITY)).toBeNull();
	});

	it('exposes Indonesian labels', () => {
		expect(humidityLabel(50)).toBe('Nyaman');
		expect(humidityLabel(90)).toBe('Sangat lembap');
		expect(humidityLabel(null)).toBeNull();
	});

	it('flags values outside the comfortable band', () => {
		expect(isHumidityNotable(50)).toBe(false);
		expect(isHumidityNotable(20)).toBe(true);
		expect(isHumidityNotable(85)).toBe(true);
		expect(isHumidityNotable(null)).toBe(false);
	});

	it('has contiguous, non-overlapping band bounds (last is open-ended)', () => {
		for (let i = 1; i < HUMIDITY_BANDS.length; i++) {
			expect(HUMIDITY_BANDS[i].min).toBe(HUMIDITY_BANDS[i - 1].max);
		}
		expect(HUMIDITY_BANDS[HUMIDITY_BANDS.length - 1].max).toBe(Infinity);
	});
});
