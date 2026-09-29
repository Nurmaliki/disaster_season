#!/usr/bin/env node
/**
 * Copies MapLibre's worker runtime into `static/maplibre/`.
 *
 * MapLibre v6 loads its web worker from a URL relative to the bundle. When the
 * library is consumed through a bundler (Vite), that URL points at a chunk the
 * bundler never emits, so the worker fails to load and the map renders blank.
 * The fix is to serve the worker as a real, stable file and point MapLibre at it
 * with `setWorkerUrl()`.
 *
 * The worker imports a sibling `maplibre-gl-shared.mjs`, so both files must be
 * copied together. This script keeps them in lockstep with the installed
 * version — run it after upgrading `maplibre-gl` (`npm run sync:maplibre`, wired
 * into `postinstall`).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'maplibre-gl', 'dist');
const to = join(root, 'static', 'maplibre');

/** Worker first, then its dependency, under stable names. */
const FILES = [
	['maplibre-gl-worker.mjs', 'worker.mjs'],
	['maplibre-gl-shared.mjs', 'maplibre-gl-shared.mjs']
];

if (!existsSync(from)) {
	console.error('[sync-maplibre] maplibre-gl is not installed; nothing to do.');
	process.exit(0);
}

mkdirSync(to, { recursive: true });

for (const [source, target] of FILES) {
	const src = join(from, source);
	if (!existsSync(src)) {
		console.error(`[sync-maplibre] missing ${source}; is the maplibre-gl version supported?`);
		process.exit(1);
	}
	copyFileSync(src, join(to, target));
	console.log(`[sync-maplibre] ${source} -> static/maplibre/${target}`);
}
