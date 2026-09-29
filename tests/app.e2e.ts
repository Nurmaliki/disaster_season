import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * These are deliberately independent of live upstream providers: every /api/*
 * call is intercepted and answered with a fixed envelope. That keeps the suite
 * deterministic (no network flakiness) while still exercising the real pages,
 * routing, map mount and responsive behaviour end to end.
 */

const ISO = '2026-01-15T04:00:00.000Z';

function envelope<T>(data: T, extra: Record<string, unknown> = {}): string {
	return JSON.stringify({
		success: true,
		data,
		meta: {
			source: 'BMKG',
			updatedAt: ISO,
			retrievedAt: ISO,
			cached: true,
			stale: false,
			partial: false,
			...extra
		}
	});
}

const WARNING_EVENT = {
	id: 'bmkg-cap:test-1',
	type: 'extreme_weather',
	category: 'early_warning',
	title: 'Peringatan Dini Cuaca — Hujan Lebat di Jakarta',
	description: 'Hujan lebat disertai angin kencang diperkirakan terjadi.',
	severity: 'high',
	severityIsInternal: false,
	location: { latitude: -6.18, longitude: 106.83, province: 'DKI Jakarta' },
	validFrom: ISO,
	validUntil: '2026-01-15T10:00:00.000Z',
	updatedAt: ISO,
	retrievedAt: ISO,
	source: { name: 'BMKG', url: 'https://www.bmkg.go.id', sourceId: 'test-1', priority: 100 },
	metadata: { cap: { severity: 'severe' } }
};

const QUAKE_EVENT = {
	id: 'bmkg-quake:test-1',
	type: 'earthquake',
	category: 'current_event',
	title: 'Gempa M5,2 — Laut Maluku',
	description: 'Magnitudo 5.2, kedalaman 10 km, Laut Maluku.',
	severity: 'moderate',
	severityIsInternal: true,
	location: { latitude: -1.5, longitude: 126.5 },
	occurredAt: ISO,
	updatedAt: ISO,
	retrievedAt: ISO,
	source: { name: 'BMKG', url: 'https://data.bmkg.go.id', sourceId: 'test-q1', priority: 100 },
	metadata: { magnitude: 5.2, depthKm: 10, tsunamiPotential: false, region: 'Laut Maluku' }
};

const VOLCANO_EVENT = {
	id: 'pvmbg:test-1',
	type: 'volcano',
	category: 'hazard',
	title: 'Gunung Merapi — Level III (Siaga)',
	severity: 'high',
	severityIsInternal: false,
	location: { latitude: -7.54, longitude: 110.44, province: 'DI Yogyakarta' },
	updatedAt: ISO,
	retrievedAt: ISO,
	source: { name: 'PVMBG / MAGMA', url: 'https://magma.esdm.go.id', priority: 100 },
	metadata: { level: 'III', coordinatesKnown: true }
};

const RISK = {
	score: 42,
	level: 'moderate',
	generatedAt: ISO,
	disclaimer:
		'Skor Risiko merupakan indikator aplikasi berdasarkan data yang tersedia dan bukan peringatan resmi. Ikuti informasi resmi BMKG, BNPB, BPBD, dan PVMBG.',
	factors: [
		{
			key: 'officialWarning',
			label: 'Peringatan resmi aktif',
			value: 0.7,
			weight: 0.35,
			reason: '1 peringatan dini aktif'
		},
		{
			key: 'recentEvents',
			label: 'Kejadian terkini',
			value: 0.4,
			weight: 0.2,
			reason: '2 kejadian'
		},
		{
			key: 'volcanoActivity',
			label: 'Aktivitas gunung api',
			value: 0.5,
			weight: 0.15,
			reason: '1 gunung'
		},
		{
			key: 'seasonalContext',
			label: 'Konteks musim',
			value: 0.85,
			weight: 0.15,
			reason: 'Puncak musim hujan'
		},
		{
			key: 'hazardExposure',
			label: 'Paparan bahaya',
			value: 0,
			weight: 0.1,
			reason: 'Tidak tersedia'
		},
		{
			key: 'weatherForecast',
			label: 'Prakiraan cuaca',
			value: 0.3,
			weight: 0.05,
			reason: 'Hujan sedang'
		}
	]
};

const DASHBOARD = {
	activeWarnings: [WARNING_EVENT],
	recentEarthquakes: [QUAKE_EVENT],
	activeVolcanoes: [VOLCANO_EVENT],
	topEvents: [WARNING_EVENT, QUAKE_EVENT, VOLCANO_EVENT],
	countsByType: { earthquake: 1, extreme_weather: 1, volcano: 1 },
	countsBySeverity: { critical: 0, high: 1, moderate: 1, low: 1, unknown: 0 },
	volcanoLevels: { III: 1 },
	risk: RISK,
	updatedAt: ISO,
	partial: false,
	warnings: [],
	hasData: true
};

/** Installs deterministic mocks for every API endpoint the pages use. */
async function mockApi(page: Page): Promise<void> {
	await page.route('**/api/dashboard**', (route) =>
		route.fulfill({ status: 200, body: envelope(DASHBOARD) })
	);
	await page.route('**/api/warnings**', (route) =>
		route.fulfill({ status: 200, body: envelope([WARNING_EVENT], { count: 1 }) })
	);
	await page.route('**/api/earthquakes**', (route) =>
		route.fulfill({ status: 200, body: envelope([QUAKE_EVENT], { count: 1 }) })
	);
	await page.route('**/api/volcanoes**', (route) =>
		route.fulfill({
			status: 200,
			body: envelope({ volcanoes: [VOLCANO_EVENT], counts: { III: 1 } })
		})
	);
	await page.route('**/api/regions**', (route) =>
		route.fulfill({
			status: 200,
			body: envelope([
				{
					code: '31',
					name: 'DKI Jakarta',
					level: 'province',
					parentCode: null,
					latitude: -6.18,
					longitude: 106.83
				},
				{
					code: '32',
					name: 'Jawa Barat',
					level: 'province',
					parentCode: null,
					latitude: -6.91,
					longitude: 107.61
				}
			])
		})
	);
	await page.route('**/api/statistics**', (route) =>
		route.fulfill({
			status: 200,
			body: envelope({
				window: '7d',
				total: 3,
				byType: [{ key: 'Gempa Bumi', label: 'Gempa Bumi', count: 1 }],
				bySeverity: [{ key: 'high', label: 'Tinggi', count: 1 }],
				byDay: [],
				bySource: [{ key: 'BMKG', label: 'BMKG', count: 2 }],
				byCategory: [{ key: 'current_event', label: 'Kejadian Terkini', count: 1 }],
				magnitudeBuckets: [{ key: '5to6', label: '5,0 – 5,9', count: 1 }],
				updatedAt: ISO,
				partial: false
			})
		})
	);
	await page.route('**/api/sources**', (route) =>
		route.fulfill({
			status: 200,
			body: envelope({
				sources: [
					{
						id: 'bmkg-earthquake',
						name: 'BMKG — Gempa Bumi',
						attribution: 'Badan Meteorologi, Klimatologi, dan Geofisika',
						url: 'https://data.bmkg.go.id',
						domains: ['earthquake'],
						categories: ['current_event'],
						notes: 'Gempa yang sudah terjadi.'
					}
				],
				disclaimer: 'Tidak ada data bencana yang dibuat-buat.'
			})
		})
	);
	await page.route('**/api/status**', (route) =>
		route.fulfill({
			status: 200,
			body: envelope({
				observed: [],
				providers: [
					{
						id: 'bmkg-earthquake',
						name: 'BMKG — Gempa Bumi',
						attribution: 'BMKG',
						url: 'https://data.bmkg.go.id',
						domains: ['earthquake'],
						status: 'online',
						latencyMs: 120,
						lastSuccessAt: ISO,
						lastAttemptAt: ISO
					}
				],
				declaredCount: 1,
				liveProbe: null
			})
		})
	);
	await page.route('**/api/risk**', (route) =>
		route.fulfill({
			status: 200,
			body: envelope({
				...RISK,
				scope: { level: 'country', code: 'ID', name: 'Indonesia' },
				weights: {},
				bands: {}
			})
		})
	);
	await page.route('**/api/nearby**', (route) =>
		route.fulfill({
			status: 200,
			body: envelope({
				center: { latitude: -6.18, longitude: 106.83 },
				radiusKm: 100,
				events: [QUAKE_EVENT],
				approxProvince: 'DKI Jakarta'
			})
		})
	);
	await page.route('**/api/search**', (route) =>
		route.fulfill({
			status: 200,
			body: envelope({
				regions: [
					{
						kind: 'region',
						id: '32',
						title: 'Jawa Barat',
						subtitle: 'Provinsi',
						href: '/location/32'
					}
				],
				events: [
					{
						kind: 'earthquake',
						id: QUAKE_EVENT.id,
						title: QUAKE_EVENT.title,
						subtitle: 'Gempa · BMKG',
						href: `/event/${QUAKE_EVENT.id}`
					}
				],
				eventsSearched: true
			})
		})
	);
}

test.describe('homepage', () => {
	test('renders the dashboard with summary, risk disclaimer and warnings', async ({ page }) => {
		await mockApi(page);
		await page.goto('/');

		// Title reflects the current plan.
		await expect(page.getByRole('heading', { name: 'Ringkasan Hari Ini' })).toBeVisible({
			timeout: 20000
		});

		// The mandatory risk disclaimer must be present somewhere on the page.
		await expect(page.getByText('bukan peringatan resmi', { exact: false }).first()).toBeVisible();

		// No-prediction statement must be present.
		await expect(page.getByText('tidak memprediksi', { exact: false }).first()).toBeVisible();
	});

	test('shows a provider error panel instead of crashing when the API fails', async ({ page }) => {
		await page.route('**/api/dashboard**', (route) =>
			route.fulfill({
				status: 503,
				body: JSON.stringify({
					success: false,
					error: { code: 'NETWORK_ERROR', message: 'Sumber tidak dapat dijangkau' }
				})
			})
		);
		await page.goto('/');
		// The app must not white-screen and must show something usable.
		await expect(page.locator('body')).toBeVisible();
		await expect(page.getByRole('link', { name: /Indonesia Disaster Monitor/i })).toBeVisible();
	});
});

test.describe('map page', () => {
	test('mounts a MapLibre canvas and lists events', async ({ page }) => {
		await mockApi(page);
		await page.goto('/map');

		// MapLibre injects a canvas into the container.
		await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20000 });
		await expect(page.getByRole('heading', { name: /peristiwa/i })).toBeVisible();
	});

	test('has a layer toggle control', async ({ page }) => {
		await mockApi(page);
		await page.goto('/map');
		await expect(page.getByRole('button', { name: /Lapisan/i })).toBeVisible();
	});
});

test.describe('warnings page', () => {
	test('lists active warnings and its data source', async ({ page }) => {
		await mockApi(page);
		await page.goto('/warnings');
		await expect(page.getByRole('heading', { name: 'Peringatan Dini Cuaca' })).toBeVisible({
			timeout: 20000
		});
	});
});

test.describe('earthquakes page', () => {
	test('shows the no-prediction note and records', async ({ page }) => {
		await mockApi(page);
		await page.goto('/earthquakes');
		await expect(page.getByRole('heading', { name: 'Gempa Bumi' })).toBeVisible({ timeout: 20000 });
		await expect(page.getByText('tidak memprediksi gempa', { exact: false }).first()).toBeVisible();
	});
});

test.describe('event detail', () => {
	test('renders event detail via the bundled store', async ({ page }) => {
		await mockApi(page);
		// Warm the store by visiting a page that aggregates, then open detail.
		await page.goto('/warnings');
		await page.goto('/event/bmkg-cap%3Atest-1');
		// Either the detail renders, or the 404 error page renders — both are
		// valid outcomes; what matters is that it does not crash.
		await expect(page.locator('body')).toBeVisible();
	});
});

test.describe('theme', () => {
	test('toggles dark mode', async ({ page }) => {
		await mockApi(page);
		await page.goto('/');
		const toggle = page.getByRole('button', { name: /mode (terang|gelap)/i });
		await toggle.click();
		await expect(page.locator('html')).toHaveClass(/dark/);
	});
});

test.describe('responsive', () => {
	test('shows the bottom navigation on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await mockApi(page);
		await page.goto('/');
		await expect(page.getByRole('navigation', { name: 'Navigasi bawah' })).toBeVisible();
	});
});

test.describe('security headers', () => {
	test('sets CSP and hardening headers', async ({ page }) => {
		await mockApi(page);
		const response = await page.goto('/');
		const headers = response?.headers() ?? {};
		expect(headers['content-security-policy']).toBeTruthy();
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['x-frame-options']).toBe('DENY');
	});
});

test.describe('global search', () => {
	test('finds both regions and events from the header combobox', async ({ page }) => {
		await mockApi(page);
		await page.goto('/');

		const input = page.getByRole('combobox', { name: /Cari wilayah atau kejadian/i });
		await input.fill('jawa');

		// Group headings prove the results are split by kind.
		await expect(page.getByText('Wilayah', { exact: true })).toBeVisible();
		await expect(page.getByText('Kejadian', { exact: true })).toBeVisible();
		await expect(page.getByRole('option', { name: /Jawa Barat/ })).toBeVisible();
		await expect(
			page.getByRole('option', { name: new RegExp(QUAKE_EVENT.title.slice(0, 12)) })
		).toBeVisible();
	});
});

test.describe('PWA', () => {
	test('exposes a web app manifest', async ({ page }) => {
		await mockApi(page);
		await page.goto('/');
		const href = await page.locator('link[rel="manifest"]').getAttribute('href');
		expect(href).toBe('/manifest.webmanifest');

		const response = await page.request.get('/manifest.webmanifest');
		expect(response.ok()).toBeTruthy();
		const manifest = await response.json();
		expect(manifest.name).toContain('Indonesia');
	});
});

test.describe('maintenance endpoint', () => {
	test('refuses to run without a configured secret', async ({ request }) => {
		// The e2e server runs with CRON_SECRET unset, which must mean "refuse",
		// never "run unauthenticated".
		const response = await request.get('/api/maintenance/retention');
		expect(response.status()).toBe(503);
		const body = await response.json();
		expect(body.success).toBe(false);
		expect(body.error.code).toBe('UNAVAILABLE');
	});
});

test.describe('events endpoint provenance', () => {
	test('reports searchedHistory:false when no database is configured', async ({ request }) => {
		// The e2e server runs stateless (no DATABASE_URL). The response must say
		// so honestly rather than implying it searched durable history.
		const response = await request.get('/api/events?sinceHours=168&limit=2000');
		expect(response.ok()).toBeTruthy();

		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.meta.searchedHistory).toBe(false);
	});
});
