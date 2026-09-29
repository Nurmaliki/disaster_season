/**
 * Central server-side configuration.
 *
 * Reads from `process.env`. SvelteKit's `$env/dynamic/private` is intentionally
 * NOT imported directly so this module stays usable from plain Node contexts
 * (unit tests, sync scripts, cron handlers) without a kit runtime.
 *
 * In a SvelteKit server context `process.env` is populated from the platform
 * environment, so behaviour is identical. Vite does not inline these values
 * because they are read at request time, never at build time.
 */
type EnvSource = Record<string, string | undefined>;

const env: EnvSource = typeof process !== 'undefined' && process.env ? process.env : {};

function num(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function str(value: string | undefined, fallback: string): string {
	const trimmed = value?.trim();
	return trimmed ? trimmed : fallback;
}

export const config = {
	providers: {
		bmkg: {
			baseUrl: str(env.BMKG_BASE_URL, 'https://data.bmkg.go.id'),
			apiBaseUrl: str(env.BMKG_API_BASE_URL, 'https://api.bmkg.go.id'),
			timeoutMs: num(env.BMKG_TIMEOUT_MS, 12_000)
		},
		pvmbg: {
			baseUrl: str(env.PVMBG_BASE_URL, 'https://magma.esdm.go.id'),
			// MAGMA is slow (observed 25–60 s cold) so this needs a generous budget.
			timeoutMs: num(env.PVMBG_TIMEOUT_MS, 25_000)
		},
		bnpb: {
			baseUrl: str(env.BNPB_BASE_URL, 'https://bnpb.go.id'),
			timeoutMs: num(env.BNPB_TIMEOUT_MS, 10_000)
		},
		inarisk: {
			baseUrl: str(env.INARISK_BASE_URL, 'https://inarisk.bnpb.go.id'),
			timeoutMs: num(env.INARISK_TIMEOUT_MS, 10_000)
		}
	},

	/**
	 * Cache TTLs in seconds, tuned per data volatility:
	 * earthquakes and warnings change fast, hazard maps effectively never change.
	 */
	ttl: {
		weather: num(env.CACHE_TTL_WEATHER, 900), // 15 min
		earthquake: num(env.CACHE_TTL_EARTHQUAKE, 120), // 2 min
		warning: num(env.CACHE_TTL_WARNING, 300), // 5 min
		volcano: num(env.CACHE_TTL_VOLCANO, 1_800), // 30 min
		disaster: num(env.CACHE_TTL_DISASTER, 900), // 15 min
		season: num(env.CACHE_TTL_SEASON, 21_600), // 6 h
		hazard: num(env.CACHE_TTL_HAZARD, 86_400), // 24 h
		regions: num(env.CACHE_TTL_REGIONS, 604_800), // 7 days
		dashboard: num(env.CACHE_TTL_DASHBOARD, 120), // 2 min
		status: num(env.CACHE_TTL_STATUS, 60) // 1 min
	},

	/** How long an expired entry may still be served when the provider is down. */
	staleTtl: {
		weather: num(env.STALE_TTL_WEATHER, 7_200),
		earthquake: num(env.STALE_TTL_EARTHQUAKE, 3_600),
		warning: num(env.STALE_TTL_WARNING, 3_600),
		volcano: num(env.STALE_TTL_VOLCANO, 86_400),
		disaster: num(env.STALE_TTL_DISASTER, 86_400),
		season: num(env.STALE_TTL_SEASON, 604_800),
		hazard: num(env.STALE_TTL_HAZARD, 604_800)
	},

	rateLimit: {
		windowMs: num(env.RATE_LIMIT_WINDOW_MS, 60_000),
		max: num(env.RATE_LIMIT_MAX, 120)
	},

	logLevel: str(env.LOG_LEVEL, 'info'),

	/** Hard ceiling on any single upstream call, regardless of provider config. */
	globalTimeoutMs: num(env.GLOBAL_TIMEOUT_MS, 30_000)
} as const;

/**
 * Public configuration. Kept separate from `config` because these values are
 * exposed to the browser bundle and must therefore be prefixed PUBLIC_ and
 * must never contain secrets.
 */
export const publicConfig = {
	map: {
		styleUrl: str(env.PUBLIC_MAP_STYLE_URL, 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'),
		darkStyleUrl: str(env.PUBLIC_MAP_STYLE_DARK_URL, 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'),
		lightStyleUrl: str(env.PUBLIC_MAP_STYLE_LIGHT_URL, 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json')
	}
} as const;

export type Config = typeof config;
