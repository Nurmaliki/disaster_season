/**
 * Central server-side configuration.
 *
 * Reads from SvelteKit's `$env/dynamic/private`, which is populated from `.env`
 * in development and from the platform environment (e.g. Vercel) in production.
 * `process.env` alone is NOT sufficient: Vite/SvelteKit do not copy `.env`
 * values into `process.env`, so reading it directly would silently ignore every
 * `.env` override (the values would always fall back to the defaults below).
 *
 * `process.env` is still consulted as a fallback so the module stays usable
 * from plain Node contexts (unit tests, sync scripts, cron handlers) where the
 * kit runtime — and therefore `$env` — is unavailable.
 */
import { env as privateEnv } from '$env/dynamic/private';

type EnvSource = Record<string, string | undefined>;

const env: EnvSource =
	Object.keys(privateEnv ?? {}).length > 0
		? (privateEnv as EnvSource)
		: typeof process !== 'undefined' && process.env
			? process.env
			: {};

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
		},
		/**
		 * NASA FIRMS — satellite fire/thermal-anomaly detections ("hotspots").
		 *
		 * This is the only reachable source of wildfire information: BMKG publishes
		 * no public hotspot endpoint, SIPONGI (KLHK) does not resolve from
		 * general-purpose hosting, and BNPB/InaRISK are unreachable. FIRMS is an
		 * official NASA service, but its area API requires a free MAP_KEY, so the
		 * provider stays dormant (reported as `unconfigured`) until `FIRMS_MAP_KEY`
		 * is set. It never fabricates a hotspot.
		 */
		firms: {
			baseUrl: str(env.FIRMS_BASE_URL, 'https://firms.modaps.eosdis.nasa.gov'),
			/**
			 * Free API key. When empty, the provider is treated as unconfigured
			 * rather than failing loudly — the feature is opt-in.
			 */
			mapKey: str(env.FIRMS_MAP_KEY, ''),
			/** VIIRS Suomi-NPP near-real-time is the standard daily product. */
			source: str(env.FIRMS_SOURCE, 'VIIRS_SNPP_NRT'),
			/** Days of detections to request (FIRMS allows 1–5). */
			dayRange: num(env.FIRMS_DAY_RANGE, 1),
			timeoutMs: num(env.FIRMS_TIMEOUT_MS, 20_000)
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
		wildfire: num(env.CACHE_TTL_WILDFIRE, 1_800), // 30 min (satellite overpass cadence)
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
		wildfire: num(env.STALE_TTL_WILDFIRE, 86_400),
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
	globalTimeoutMs: num(env.GLOBAL_TIMEOUT_MS, 30_000),

	/**
	 * Optional persistence.
	 *
	 * The application is designed to run fully stateless: when `DATABASE_URL` is
	 * absent the in-process event store is used and the app behaves identically
	 * (minus cross-restart history). Setting `DATABASE_URL` opts into durable
	 * history for statistics — it is never required for the app to function.
	 *
	 * `DATABASE_URL` must NOT be prefixed PUBLIC_ and is never sent to the client.
	 */
	database: {
		url: str(env.DATABASE_URL, ''),
		enabled: Boolean(env.DATABASE_URL && env.DATABASE_URL.trim()),
		/** Connection pool ceiling per instance. */
		maxConnections: num(env.DATABASE_MAX_CONNECTIONS, 5),
		/** Statement/connection timeout in ms. */
		connectTimeoutMs: num(env.DATABASE_CONNECT_TIMEOUT_MS, 10_000),
		/** How long a persisted event is retained before pruning. */
		retentionDays: num(env.DATABASE_RETENTION_DAYS, 90)
	},

	/**
	 * Maintenance / retention.
	 *
	 * `CRON_SECRET` protects the maintenance endpoint that prunes expired events.
	 * When it is unset, the endpoint refuses to run at all rather than leaving an
	 * unauthenticated destructive route open. This is a credential and is never
	 * exposed to the browser.
	 */
	maintenance: {
		cronSecret: str(env.CRON_SECRET, ''),
		enabled: Boolean(env.CRON_SECRET && env.CRON_SECRET.trim())
	}
} as const;

/**
 * Note: browser-exposed map configuration (basemap style URLs) is read directly
 * from `$env/dynamic/public` inside the map component, so there is a single
 * source of truth and no server-side duplicate that could drift out of sync.
 * See `PUBLIC_MAP_STYLE_*` in `.env.example`.
 */

export type Config = typeof config;
