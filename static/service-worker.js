/*
 * Service worker.
 *
 * Strategy:
 *   - Navigation requests: network-first, falling back to the cached shell when
 *     offline, so the app always shows *something* rather than a browser error.
 *   - Static assets (build output, icons): cache-first, since they are immutable
 *     or change rarely.
 *   - API requests: ALWAYS network-only. Disaster/warning data must never be
 *     served from a stale cache by the service worker — the app has its own
 *     explicit cache + freshness indicators and we must not hide them.
 *
 * No request body, credential or private data is ever cached.
 */

const SHELL_CACHE = 'idm-shell-v1';
const ASSET_CACHE = 'idm-assets-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(SHELL_CACHE);
			// Best-effort shell precache; a failure here must not block install.
			await cache.addAll([OFFLINE_URL]).catch(() => {});
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
					.map((key) => caches.delete(key))
			);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;

	// Only handle GETs from the same origin.
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// API: network-only. Never cache, so freshness indicators stay truthful.
	if (url.pathname.startsWith('/api/')) return;

	// Navigations: network-first with offline shell fallback.
	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request);
					return response;
				} catch {
					const cache = await caches.open(SHELL_CACHE);
					const cached = (await cache.match(request)) || (await cache.match(OFFLINE_URL));
					return (
						cached ||
						new Response('Anda sedang offline.', {
							status: 503,
							headers: { 'content-type': 'text/plain; charset=utf-8' }
						})
					);
				}
			})()
		);
		return;
	}

	// Static assets: cache-first.
	const isAsset =
		url.pathname.startsWith('/_app/') ||
		url.pathname.startsWith('/icons/') ||
		/\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|webmanifest)$/.test(url.pathname);

	if (!isAsset) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(ASSET_CACHE);
			const cached = await cache.match(request);
			if (cached) return cached;

			try {
				const response = await fetch(request);
				// Only cache successful, non-opaque responses.
				if (response.ok && response.type === 'basic') {
					cache.put(request, response.clone());
				}
				return response;
			} catch {
				return new Response('', { status: 504 });
			}
		})()
	);
});
