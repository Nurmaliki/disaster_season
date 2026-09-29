import type { RequestHandler } from './$types';

/**
 * Dynamic sitemap.
 *
 * Only public navigational pages are listed. Event and location pages are
 * intentionally excluded: their IDs are ephemeral (events age out of the
 * upstream feeds) and location pages are numerous, so listing them would create
 * stale, low-quality entries.
 */
const PUBLIC_PATHS = [
	'/',
	'/map',
	'/warnings',
	'/earthquakes',
	'/volcanoes',
	'/weather',
	'/seasons',
	'/statistics',
	'/sources',
	'/status',
	'/about'
];

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	setHeaders({
		'content-type': 'application/xml; charset=utf-8',
		'cache-control': 'public, max-age=3600'
	});

	const origin = url.origin;
	const today = new Date().toISOString().slice(0, 10);

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PUBLIC_PATHS.map(
	(path) => `	<url>
		<loc>${origin}${path}</loc>
		<lastmod>${today}</lastmod>
		<changefreq>${path === '/' || path === '/warnings' || path === '/earthquakes' ? 'hourly' : 'daily'}</changefreq>
		<priority>${path === '/' ? '1.0' : path === '/map' ? '0.9' : '0.6'}</priority>
	</url>`
).join('\n')}
</urlset>
`;

	return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
