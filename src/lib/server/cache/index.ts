import { logger }  from '$lib/server/logger.ts';

interface CacheEntry<T> {
	value: T;
	/** ms epoch when the value was written. */
	storedAt: number;
	/** ms epoch after which the value is considered stale (but may still be served). */
	freshUntil: number;
	/** ms epoch after which the value must be discarded. */
	expiresAt: number;
}

export interface CacheLookup<T> {
	value: T | null;
	cached: boolean;
	stale: boolean;
	storedAt: number | null;
}

/**
 * In-process TTL cache with stale-while-revalidate semantics.
 *
 * On Vercel (serverless) each instance keeps its own cache and instances are
 * recycled, so this is a best-effort optimisation, not shared state. That is
 * deliberate: the app never relies on cache for correctness, only for rate-limit
 * protection and latency. Postgres-backed caching can be layered behind the same
 * interface later without touching call sites.
 */
class MemoryCache {
	private store = new Map<string, CacheEntry<unknown>>();
	private maxEntries: number;

	constructor(maxEntries = 500) {
		this.maxEntries = maxEntries;
	}

	get<T>(key: string): CacheLookup<T> {
		const entry = this.store.get(key) as CacheEntry<T> | undefined;
		const now = Date.now();

		if (!entry) {
			return { value: null, cached: false, stale: false, storedAt: null };
		}
		if (now > entry.expiresAt) {
			this.store.delete(key);
			return { value: null, cached: false, stale: false, storedAt: null };
		}
		if (now > entry.freshUntil) {
			return { value: entry.value, cached: true, stale: true, storedAt: entry.storedAt };
		}
		return { value: entry.value, cached: true, stale: false, storedAt: entry.storedAt };
	}

	set<T>(key: string, value: T, ttlSeconds: number, staleSeconds = 0): void {
		if (this.store.size >= this.maxEntries) {
			// Evict the oldest ~10% instead of clearing everything.
			const sorted = [...this.store.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
			for (const [k] of sorted.slice(0, Math.ceil(this.maxEntries * 0.1))) this.store.delete(k);
		}
		const now = Date.now();
		this.store.set(key, {
			value,
			storedAt: now,
			freshUntil: now + ttlSeconds * 1000,
			expiresAt: now + (ttlSeconds + staleSeconds) * 1000
		});
	}

	delete(key: string): void {
		this.store.delete(key);
	}

	clear(): void {
		this.store.clear();
	}

	get size(): number {
		return this.store.size;
	}
}

export const cache = new MemoryCache();

export interface CachedResult<T> {
	data: T;
	cached: boolean;
	stale: boolean;
	storedAt: string | null;
	/** Set when the upstream fetch failed but a stale value was returned. */
	degraded?: boolean;
}

/**
 * Cache-aside with automatic stale fallback.
 *
 * - Fresh entry  -> returned immediately, loader is not called.
 * - Stale entry  -> returned immediately (isr-style) and the loader is NOT awaited,
 *                   because provider latency must not leak into user requests.
 * - Missing/expired -> loader is awaited. If the loader throws and an expired-but-present
 *                   entry exists, the stale value is served with degraded=true.
 */
export async function cached<T>(
	key: string,
	ttlSeconds: number,
	loader: () => Promise<T>,
	options: { staleSeconds?: number; forceRefresh?: boolean } = {}
): Promise<CachedResult<T>> {
	const { staleSeconds = 0, forceRefresh = false } = options;

	if (!forceRefresh) {
		const hit = cache.get<T>(key);
		if (hit.value !== null && !hit.stale) {
			logger.debug('cache hit', { cache: 'hit', key });
			return {
				data: hit.value,
				cached: true,
				stale: false,
				storedAt: hit.storedAt ? new Date(hit.storedAt).toISOString() : null
			};
		}
		if (hit.value !== null && hit.stale) {
			// Serve stale, refresh in background without blocking the response.
			void loader()
				.then((fresh) => cache.set(key, fresh, ttlSeconds, staleSeconds))
				.catch((error) => logger.warn('background revalidate failed', { key, error }));
			return {
				data: hit.value,
				cached: true,
				stale: true,
				storedAt: hit.storedAt ? new Date(hit.storedAt).toISOString() : null,
				degraded: true
			};
		}
	}

	logger.debug('cache miss', { cache: 'miss', key });
	try {
		const fresh = await loader();
		cache.set(key, fresh, ttlSeconds, staleSeconds);
		return { data: fresh, cached: false, stale: false, storedAt: new Date().toISOString() };
	} catch (error) {
		const fallback = cache.get<T>(key);
		if (fallback.value !== null) {
			logger.warn('serving stale after loader failure', { key, error });
			return {
				data: fallback.value,
				cached: true,
				stale: true,
				storedAt: fallback.storedAt ? new Date(fallback.storedAt).toISOString() : null,
				degraded: true
			};
		}
		throw error;
	}
}

export function cacheKey(...parts: (string | number | undefined | null)[]): string {
	return parts.filter((p) => p !== undefined && p !== null && p !== '').join(':');
}
