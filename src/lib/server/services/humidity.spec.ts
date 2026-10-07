import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * National humidity summary.
 *
 * `getWeather` is stubbed so these assertions are about OUR aggregation logic —
 * averaging, min/max, band tallying and the honest `partial` flag — not about
 * BMKG. The most important guarantees: a failed probe is dropped rather than
 * counted as zero, and a partially-reachable lattice is reported as `partial`.
 */

const getWeather = vi.fn();

vi.mock('$lib/server/services/aggregate', () => ({
	getWeather: (...args: unknown[]) => getWeather(...args)
}));

vi.mock('$lib/data/provinces', () => ({
	PROVINCES: [
		{
			code: '31',
			name: 'DKI Jakarta',
			latitude: -6.2,
			longitude: 106.8,
			capitalAdm4: '31.71.01.1001'
		},
		{
			code: '32',
			name: 'Jawa Barat',
			latitude: -6.9,
			longitude: 107.6,
			capitalAdm4: '32.73.01.1001'
		},
		{
			code: '33',
			name: 'Jawa Tengah',
			latitude: -6.97,
			longitude: 110.42,
			capitalAdm4: '33.74.01.1001'
		}
	]
}));

function weather(humidity: number | null, temperatureC: number | null = 30) {
	return {
		weather: {
			location: {
				adm1: '31',
				adm2: '31.71',
				adm3: '31.71.01',
				adm4: '31.71.01.1001',
				province: 'DKI Jakarta',
				regency: 'Jakarta Pusat',
				district: 'Gambir',
				village: 'Gambir',
				latitude: -6.17,
				longitude: 106.8,
				timezone: 'Asia/Jakarta'
			},
			current: { humidity, temperatureC }
		}
	};
}

beforeEach(() => {
	getWeather.mockReset();
});

describe('getHumiditySummary', () => {
	it('averages readings and computes min/max across provinces', async () => {
		getWeather
			.mockResolvedValueOnce(weather(60))
			.mockResolvedValueOnce(weather(80))
			.mockResolvedValueOnce(weather(70));

		const { getHumiditySummary } = await import('$lib/server/services/humidity');
		const summary = await getHumiditySummary();

		expect(summary.sampledCount).toBe(3);
		expect(summary.totalCount).toBe(3);
		expect(summary.nationalAverage).toBeCloseTo(70, 5);
		expect(summary.min).toBe(60);
		expect(summary.max).toBe(80);
		expect(summary.partial).toBe(false);
	});

	it('tallies readings into the internal humidity bands', async () => {
		getWeather
			.mockResolvedValueOnce(weather(20)) // very_dry
			.mockResolvedValueOnce(weather(50)) // comfortable
			.mockResolvedValueOnce(weather(90)); // very_humid

		const { getHumiditySummary } = await import('$lib/server/services/humidity');
		const summary = await getHumiditySummary();

		expect(summary.bandCounts.very_dry).toBe(1);
		expect(summary.bandCounts.comfortable).toBe(1);
		expect(summary.bandCounts.very_humid).toBe(1);
		expect(summary.bandCounts.dry).toBe(0);
	});

	it('drops a failed probe and reports the snapshot as partial', async () => {
		getWeather
			.mockResolvedValueOnce(weather(50))
			.mockRejectedValueOnce(new Error('bmkg down'))
			.mockResolvedValueOnce(weather(70));

		const { getHumiditySummary } = await import('$lib/server/services/humidity');
		const summary = await getHumiditySummary();

		expect(summary.sampledCount).toBe(2);
		expect(summary.totalCount).toBe(3);
		expect(summary.partial).toBe(true);
		expect(summary.nationalAverage).toBeCloseTo(60, 5);
	});

	it('ignores a probe whose reading has no humidity value', async () => {
		getWeather
			.mockResolvedValueOnce(weather(null))
			.mockResolvedValueOnce(weather(80))
			.mockResolvedValueOnce(weather(60));

		const { getHumiditySummary } = await import('$lib/server/services/humidity');
		const summary = await getHumiditySummary();

		expect(summary.sampledCount).toBe(2);
		expect(summary.partial).toBe(true);
	});

	it('returns a null average (not zero) when every probe fails', async () => {
		getWeather.mockRejectedValue(new Error('bmkg down'));

		const { getHumiditySummary } = await import('$lib/server/services/humidity');
		const summary = await getHumiditySummary();

		expect(summary.sampledCount).toBe(0);
		expect(summary.nationalAverage).toBeNull();
		expect(summary.min).toBeNull();
		expect(summary.max).toBeNull();
		expect(summary.partial).toBe(true);
	});
});
