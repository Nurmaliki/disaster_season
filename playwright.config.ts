import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 *
 * The suite runs against a real production build (`npm run build && npm run
 * preview`) so it exercises the same output that ships. API calls are mocked in
 * the tests themselves, so no live provider access is required and the suite is
 * deterministic offline.
 */
export default defineConfig({
	testDir: './tests',
	testMatch: '**/*.e2e.{ts,js}',

	// Providers and the in-process cache make parallel state hard; keep it simple.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',

	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],

	webServer: {
		// The preview server is started with provider endpoints pointed at a
		// non-routable address and very short timeouts. SSR loads therefore
		// degrade quickly and deterministically instead of waiting on live BMKG
		// calls, while the browser-side `/api/*` routes are still mocked per
		// test. This keeps the suite fast and offline-safe without pretending
		// the providers are reachable.
		command:
			'PROVIDER_OFFLINE=1 BMKG_BASE_URL=http://127.0.0.1:9 BMKG_API_BASE_URL=http://127.0.0.1:9 PVMBG_BASE_URL=http://127.0.0.1:9 BNPB_BASE_URL=http://127.0.0.1:9 INARISK_BASE_URL=http://127.0.0.1:9 BMKG_TIMEOUT_MS=400 PVMBG_TIMEOUT_MS=400 BNPB_TIMEOUT_MS=400 INARISK_TIMEOUT_MS=400 GLOBAL_TIMEOUT_MS=2000 npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 240_000
	}
});
