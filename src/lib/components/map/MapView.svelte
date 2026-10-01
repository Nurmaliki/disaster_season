<script lang="ts" module>
	const CATEGORY_LABELS: Record<string, string> = {
		early_warning: 'Peringatan dini',
		current_event: 'Kejadian terkini',
		observation: 'Pengamatan',
		forecast: 'Prakiraan',
		hazard: 'Peta bahaya',
		historical: 'Historis'
	};
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl';
	import type { DisasterEvent } from '$lib/types';
	import type { WindPayload, WindSample } from '$lib/api/types';
	import WindParticleLayer from '$lib/components/map/WindParticleLayer.svelte';
	import {
		eventsToFeatureCollection,
		MAP_IDS,
		INDONESIA_CENTER,
		INDONESIA_ZOOM,
		AREA_PAINT,
		severityColorExpression,
		severityRadiusExpression,
		clusterSeverityColorExpression
	} from '$lib/map/layers';
	import { SEVERITY_TOKENS } from '$lib/utils/severity';
	import { formatDateTime } from '$lib/utils/format';
	import { theme } from '$lib/stores/theme';
	import { apiGet, errorMessage } from '$lib/api/client';
	import { LocateFixed, Layers, X, Compass } from 'lucide-svelte';

	/**
	 * The map.
	 *
	 * Key properties:
	 *  - Clustering is done by MapLibre (source + layers), never by DOM markers,
	 *    so tens of thousands of points stay performant.
	 *  - Popups are built from plain DOM with textContent only — no innerHTML —
	 *    so provider-supplied strings can never inject markup.
	 *  - Geolocation only runs after an explicit user click and the resulting
	 *    coordinate is never sent to a provider (see /api/nearby).
	 *  - A compass rose (U/T/S/B) tracks map rotation, and an optional wind
	 *    particle overlay animates flow direction from /api/wind. The overlay is
	 *    lazy: no wind request is made until the user switches the layer on.
	 */
	interface Props {
		events: DisasterEvent[];
		height?: string;
		/** Called when the user clicks a marker, so a parent panel can react. */
		onSelect?: (event: DisasterEvent | null) => void;
		/** Sync the view with the URL (?lat&lng&zoom). */
		syncUrl?: boolean;
		showControls?: boolean;
		initialCenter?: [number, number];
		initialZoom?: number;
		/**
		 * Zoom at/above which points stop clustering and render individually.
		 * Lower it (e.g. for a single-hazard view) to reveal individual
		 * positions sooner instead of one big cluster.
		 */
		clusterMaxZoom?: number;
	}

	let {
		events,
		height = '100%',
		onSelect,
		syncUrl = true,
		showControls = true,
		initialCenter = INDONESIA_CENTER,
		initialZoom = INDONESIA_ZOOM,
		clusterMaxZoom = 11
	}: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let map: MaplibreMap | null = $state(null);
	let mapReady = $state(false);
	let mapError = $state<string | null>(null);
	/** Current map rotation in degrees (0 = north up), for the compass rose. */
	let mapBearing = $state(0);
	/** Fires if the basemap has not loaded within the grace period. */
	let loadWatchdog: number | null = null;
	/** Keeps the map canvas sized to its container across layout changes. */
	let resizeObserver: ResizeObserver | null = null;
	let locating = $state(false);
	let locationNotice = $state<string | null>(null);
	let showLayers = $state(false);

	// Wind overlay: off by default so the map loads without an extra network
	// round-trip; toggled on from the layer panel when the user wants it.
	let showWind = $state(false);
	let windSamples = $state<WindSample[]>([]);
	let windLoading = $state(false);
	let windError = $state<string | null>(null);
	/** Bumped on each toggle-on so a fresh field is fetched at most once per session-ish. */
	let windFetchedAt = 0;

	// Layer visibility toggles.
	let layerVisibility = $state({
		early_warning: true,
		current_event: true,
		observation: true,
		forecast: true,
		hazard: true,
		historical: false
	});

	const byId = $derived(new Map(events.map((event) => [event.id, event])));

	/**
	 * Basemap style for the active theme.
	 *
	 * These come from PUBLIC_MAP_STYLE_* so a deployment can point at a different
	 * provider without a code change. The defaults are OpenFreeMap, which serves
	 * the whole style from one host and is not commonly blocked by browser
	 * extensions (a blocked basemap shows a blank map).
	 */
	const MAP_STYLES = {
		light: env.PUBLIC_MAP_STYLE_LIGHT_URL || 'https://tiles.openfreemap.org/styles/positron',
		dark: env.PUBLIC_MAP_STYLE_DARK_URL || 'https://tiles.openfreemap.org/styles/dark'
	} as const;

	function styleUrlFor(currentTheme: string): string {
		return currentTheme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light;
	}

	/** The set of categories currently visible, as a MapLibre `in` filter. */
	function categoryFilter(): unknown[] {
		const visible = Object.entries(layerVisibility)
			.filter(([, on]) => on)
			.map(([key]) => key);
		return ['in', ['get', 'category'], ['literal', visible]];
	}

	onMount(async () => {
		if (!container) return;

		try {
			const maplibre = await import('maplibre-gl');
			await import('maplibre-gl/dist/maplibre-gl.css');

			// MapLibre v6 resolves its web worker from a URL relative to its own
			// bundle. Under a bundler that URL points at a chunk which is never
			// emitted, so the worker fails to load and the map stays blank. We
			// serve a copy of the worker from `static/maplibre/` (kept in sync by
			// `npm run sync:maplibre`) and point MapLibre at it explicitly. This
			// must happen before the Map is constructed.
			maplibre.setWorkerUrl('/maplibre/worker.mjs');

			const url = new URL(window.location.href);
			const centerParam = [
				Number(url.searchParams.get('lng')),
				Number(url.searchParams.get('lat'))
			] as [number, number];
			const zoomParam = Number(url.searchParams.get('zoom'));

			const hasValidParams =
				syncUrl &&
				Number.isFinite(centerParam[0]) &&
				Number.isFinite(centerParam[1]) &&
				centerParam[0] >= 90 &&
				centerParam[0] <= 145 &&
				centerParam[1] >= -14 &&
				centerParam[1] <= 10;

			const startCenter = hasValidParams ? centerParam : initialCenter;
			const startZoom = Number.isFinite(zoomParam) && zoomParam > 0 ? zoomParam : initialZoom;

			map = new maplibre.Map({
				container,
				style: styleUrlFor($theme),
				center: startCenter,
				zoom: startZoom,
				minZoom: 3,
				maxZoom: 16,
				attributionControl: false,
				// Keep interaction usable on touch devices without hijacking scroll.
				cooperativeGestures: false,
				// Keyboard navigation is important for accessibility.
				keyboard: true
			});

			// The compass button is shown so users can see and reset north; the
			// rose overlay below mirrors the heading numerically.
			map.addControl(new maplibre.NavigationControl({ showCompass: true }), 'top-right');
			map.addControl(
				new maplibre.AttributionControl({
					compact: true,
					customAttribution:
						'Data: BMKG, PVMBG/MAGMA, BNPB, InaRISK · Peta: © OpenStreetMap contributors, © OpenFreeMap'
				}),
				'bottom-right'
			);
			map.addControl(new maplibre.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

			map.on('load', () => {
				if (!map) return;
				addSourcesAndLayers();
				mapReady = true;
				mapError = null;
				updateData();
			});

			map.on('error', (event) => {
				// Map tile/style failures must not crash the page.
				console.warn('[map] non-fatal error', event.error?.message ?? event);
				if (!mapReady)
					mapError = 'Gaya peta tidak dapat dimuat. Data tetap dapat dilihat pada daftar.';
			});

			// If the basemap never loads (offline, DNS failure, or a browser
			// extension blocking the tile host) MapLibre can stay silent rather than
			// raising an error event, leaving a blank canvas with no explanation.
			// Surface it explicitly so the blank map is never unexplained.
			loadWatchdog = window.setTimeout(() => {
				if (!mapReady) {
					mapError =
						'Peta dasar tidak dapat dimuat. Periksa koneksi internet, atau matikan pemblokir iklan untuk situs ini. Data tetap tersedia pada daftar di samping.';
				}
			}, 8000);

			if (syncUrl) {
				map.on('moveend', persistView);
			}

			// Track rotation so the compass rose overlay can spin with the map.
			map.on('rotate', () => {
				if (map) mapBearing = map.getBearing();
			});

			// Keep the map sized to its container.
			//
			// MapLibre measures its container once at construction. In flex
			// layouts the container can legitimately be 0-height on first paint
			// (the parent's size is only resolved after layout), which leaves the
			// canvas clipped and the map invisible even though it is rendering.
			// A ResizeObserver corrects this as soon as the real size is known and
			// on every subsequent layout change (sidebar toggle, window resize).
			if (container && typeof ResizeObserver !== 'undefined') {
				resizeObserver = new ResizeObserver(() => {
					map?.resize();
				});
				resizeObserver.observe(container);
			}
		} catch (error) {
			console.error('[map] initialisation failed', error);
			mapError = 'Peta tidak dapat dimuat pada perangkat ini.';
		}
	});

	function addSourcesAndLayers(): void {
		if (!map) return;

		const empty = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;

		map.addSource(MAP_IDS.areaSource, { type: 'geojson', data: empty });
		map.addSource(MAP_IDS.clusterSource, {
			type: 'geojson',
			data: empty,
			cluster: true,
			clusterRadius: 48,
			clusterMaxZoom,
			// Aggregate the worst severity into each cluster so a cluster of
			// critical events is never shown as green.
			clusterProperties: {
				maxSeverityRank: ['max', ['get', 'severityRank']]
			}
		});

		// --- Area (warning/hazard polygons) ---
		map.addLayer({
			id: MAP_IDS.areaFill,
			type: 'fill',
			source: MAP_IDS.areaSource,
			paint: AREA_PAINT['warning-fill'] as never,
			filter: categoryFilter() as never
		});
		map.addLayer({
			id: MAP_IDS.areaOutline,
			type: 'line',
			source: MAP_IDS.areaSource,
			paint: AREA_PAINT['warning-outline'] as never,
			filter: categoryFilter() as never
		});

		// --- Clusters ---
		map.addLayer({
			id: MAP_IDS.clusters,
			type: 'circle',
			source: MAP_IDS.clusterSource,
			filter: ['has', 'point_count'] as never,
			paint: {
				'circle-color': clusterSeverityColorExpression() as never,
				'circle-opacity': 0.85,
				'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26, 200, 34] as never,
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ffffff'
			}
		});
		map.addLayer({
			id: MAP_IDS.clusterCount,
			type: 'symbol',
			source: MAP_IDS.clusterSource,
			filter: ['has', 'point_count'] as never,
			layout: {
				'text-field': ['get', 'point_count_abbreviated'] as never,
				// A symbol layer with no `icon-image` makes MapLibre request its
				// built-in default icon ('circle-11'), which basemap sprites such as
				// OpenFreeMap's do not contain — producing a console warning on every
				// load. Binding to a property the features never carry yields a null
				// icon, so nothing is requested.
				'icon-image': ['get', '__no_icon'] as never,
				// An explicit font stack is required: when omitted MapLibre falls
				// back to its built-in default ("Open Sans Regular", "Arial Unicode
				// MS Regular"), which most basemap glyph servers (including
				// OpenFreeMap) do not host, producing 404s and locally-rendered,
				// inconsistent glyphs. "Noto Sans Bold" is served by the basemap.
				'text-font': ['Noto Sans Bold'] as never,
				'text-size': 12
			},
			paint: { 'text-color': '#ffffff' }
		});

		// --- Individual points ---
		// A soft area halo under each point gives it an areal footprint on the
		// map (a hotspot is a detection with spatial extent, not a pin). Drawn
		// below the point so the exact centre stays readable.
		map.addLayer({
			id: MAP_IDS.pointAreas,
			type: 'circle',
			source: MAP_IDS.clusterSource,
			filter: ['!', ['has', 'point_count']] as never,
			paint: {
				'circle-color': severityColorExpression() as never,
				'circle-radius': 14,
				'circle-opacity': 0.14,
				'circle-blur': 1
			}
		});

		// Hazard/risk zones render as hollow rings so they are visually distinct
		// from actual events.
		map.addLayer({
			id: MAP_IDS.points,
			type: 'circle',
			source: MAP_IDS.clusterSource,
			filter: ['!', ['has', 'point_count']] as never,
			paint: {
				'circle-color': severityColorExpression() as never,
				'circle-radius': severityRadiusExpression() as never,
				'circle-stroke-width': 1.5,
				'circle-stroke-color': '#ffffff',
				'circle-opacity': 0.92
			}
		});

		map.addLayer({
			id: MAP_IDS.pointLabels,
			type: 'symbol',
			source: MAP_IDS.clusterSource,
			filter: ['!', ['has', 'point_count']] as never,
			layout: {
				'text-field': ['get', 'label'] as never,
				// See clusterCount above: a bound-but-absent icon-image avoids a
				// request for MapLibre's built-in default sprite icon.
				'icon-image': ['get', '__no_icon'] as never,
				// See clusterCount above: an explicit, basemap-hosted font stack
				// avoids 404 glyph lookups for MapLibre's built-in default fonts.
				'text-font': ['Noto Sans Regular'] as never,
				'text-size': 10,
				'text-offset': [0, 1.4],
				'text-anchor': 'top',
				'text-allow-overlap': false,
				'text-optional': true
			},
			paint: {
				'text-color': '#0f172a',
				'text-halo-color': '#ffffff',
				'text-halo-width': 1.2
			},
			// Labels appear as soon as individual points separate from a cluster,
			// so the distribution is legible before zooming all the way in.
			minzoom: 5
		});

		// --- Interactions ---
		map.on('click', MAP_IDS.clusters, (event) => {
			const feature = map!.queryRenderedFeatures(event.point, { layers: [MAP_IDS.clusters] })[0];
			if (!feature) return;
			const clusterId = feature.properties?.cluster_id as number;
			const source = map!.getSource(MAP_IDS.clusterSource) as GeoJSONSource;
			source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
				map!.easeTo({
					center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
					zoom
				});
			});
		});

		map.on('click', MAP_IDS.points, (event) => {
			const feature = event.features?.[0];
			if (!feature) return;
			const id = feature.properties?.id as string;
			const chosen = byId.get(id) ?? null;
			showPopup(feature.geometry, feature.properties);
			if (chosen) onSelect?.(chosen);
		});

		for (const layer of [MAP_IDS.clusters, MAP_IDS.points]) {
			map.on('mouseenter', layer, () => {
				if (map) map.getCanvas().style.cursor = 'pointer';
			});
			map.on('mouseleave', layer, () => {
				if (map) map.getCanvas().style.cursor = '';
			});
		}
	}

	/** Builds the popup entirely with DOM APIs — provider text is never parsed as HTML. */
	function showPopup(geometry: GeoJSON.Geometry, properties: Record<string, unknown> | null): void {
		if (!map || !properties) return;
		void import('maplibre-gl').then((maplibre) => {
			const coordinates = coordinatesOf(geometry);
			if (!coordinates) return;

			const root = document.createElement('div');
			root.className = 'p-3 max-w-[20rem] space-y-1.5';

			const header = document.createElement('div');
			header.className = 'flex items-center gap-2';

			const typeLabel = document.createElement('span');
			typeLabel.className = 'text-[10px] font-bold uppercase tracking-wide opacity-70';
			typeLabel.textContent = String(properties.typeLabel ?? '');

			const severity = document.createElement('span');
			severity.className = 'rounded px-1.5 py-0.5 text-[10px] font-bold text-white';
			severity.style.backgroundColor =
				SEVERITY_TOKENS[String(properties.severity) as keyof typeof SEVERITY_TOKENS]?.hex ??
				'#64748b';
			severity.textContent = String(properties.severity ?? '');

			header.append(typeLabel, severity);

			const title = document.createElement('h3');
			title.className = 'text-sm font-semibold leading-snug';
			title.textContent = String(properties.title ?? '');

			const facts = document.createElement('p');
			facts.className = 'text-xs opacity-80';
			facts.textContent = String(properties.facts ?? '');

			const when = document.createElement('p');
			when.className = 'text-[11px] opacity-70';
			when.textContent = formatDateTime(String(properties.when ?? ''));

			const source = document.createElement('p');
			source.className = 'text-[10px] opacity-60';
			source.textContent = `Sumber: ${String(properties.source ?? '')}`;

			const link = document.createElement('a');
			link.href = `/event/${encodeURIComponent(String(properties.id ?? ''))}`;
			link.className =
				'inline-block pt-1 text-xs font-semibold text-sky-600 underline dark:text-sky-400';
			link.textContent = 'Lihat detail →';

			root.append(header, title);
			if (facts.textContent) root.append(facts);
			root.append(when, source, link);

			new maplibre.Popup({ closeButton: true, maxWidth: '22rem' })
				.setLngLat(coordinates)
				.setDOMContent(root)
				.addTo(map!);
		});
	}

	function coordinatesOf(geometry: GeoJSON.Geometry): [number, number] | null {
		if (geometry.type === 'Point') {
			const [lng, lat] = geometry.coordinates as [number, number];
			return [lng, lat];
		}
		if (geometry.type === 'Polygon') {
			const ring = (geometry.coordinates as number[][][])[0];
			if (!ring?.length) return null;
			const [sumLng, sumLat] = ring.reduce(([lng, lat], [x, y]) => [lng + x, lat + y], [0, 0]);
			return [sumLng / ring.length, sumLat / ring.length];
		}
		if (geometry.type === 'MultiPolygon') {
			const first = (geometry.coordinates as number[][][][])[0]?.[0];
			if (!first?.length) return null;
			const [sumLng, sumLat] = first.reduce(([lng, lat], [x, y]) => [lng + x, lat + y], [0, 0]);
			return [sumLng / first.length, sumLat / first.length];
		}
		return null;
	}

	/** Pushes the current events into the map sources. */
	function updateData(): void {
		if (!map || !mapReady) return;

		const collection = eventsToFeatureCollection(events);

		// Points feed the clustering source; areas feed the polygon source.
		const pointFeatures = {
			type: 'FeatureCollection',
			features: collection.features.map((feature) => ({
				...feature,
				// Add a numeric severity rank used by cluster aggregation.
				properties: {
					...feature.properties,
					severityRank: severityRank(String(feature.properties.severity))
				}
			}))
		};

		const clusterSource = map.getSource(MAP_IDS.clusterSource) as GeoJSONSource | undefined;
		clusterSource?.setData(pointFeatures as never);

		const areaSource = map.getSource(MAP_IDS.areaSource) as GeoJSONSource | undefined;
		areaSource?.setData(collection as never);

		applyFilters();
	}

	function applyFilters(): void {
		if (!map || !mapReady) return;
		const filter = categoryFilter() as never;
		map.setFilter(MAP_IDS.areaFill, filter);
		map.setFilter(MAP_IDS.areaOutline, filter);
		map.setFilter(MAP_IDS.pointAreas, ['all', ['!', ['has', 'point_count']], filter] as never);
		map.setFilter(MAP_IDS.points, ['all', ['!', ['has', 'point_count']], filter] as never);
		map.setFilter(MAP_IDS.pointLabels, ['all', ['!', ['has', 'point_count']], filter] as never);
	}

	function severityRank(severity: string): number {
		return { critical: 5, high: 4, moderate: 3, low: 2, unknown: 1 }[severity] ?? 0;
	}

	function persistView(): void {
		if (!map || !syncUrl) return;
		const center = map.getCenter();
		// persistView only runs where syncUrl is enabled (the /map route), so the
		// target is a known route rather than an arbitrary URL. resolve() keeps
		// SvelteKit's router authoritative, and replaceState keeps it in sync
		// without polluting the back button on every pan.
		const params = new URLSearchParams({
			lat: center.lat.toFixed(3),
			lng: center.lng.toFixed(3),
			zoom: map.getZoom().toFixed(2)
		});
		const target = resolve(`/map?${params.toString()}` as '/map');
		replaceState(target, {});
	}

	/** Requested only on explicit user action. */
	function locate(): void {
		if (!navigator.geolocation) {
			locationNotice = 'Perangkat ini tidak mendukung geolokasi.';
			return;
		}
		locating = true;
		locationNotice = null;

		navigator.geolocation.getCurrentPosition(
			(position) => {
				locating = false;
				if (!map) return;
				const { latitude, longitude } = position.coords;
				if (!(latitude >= -14 && latitude <= 10 && longitude >= 90 && longitude <= 145)) {
					locationNotice = 'Lokasi Anda terdeteksi di luar wilayah Indonesia.';
					return;
				}
				map.flyTo({ center: [longitude, latitude], zoom: 8 });
				if (syncUrl) persistView();
			},
			(error) => {
				locating = false;
				locationNotice =
					error.code === error.PERMISSION_DENIED
						? 'Akses lokasi ditolak. Anda dapat mencari wilayah secara manual.'
						: 'Lokasi tidak dapat ditentukan saat ini.';
			},
			{ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
		);
	}

	function resetView(): void {
		map?.flyTo({ center: initialCenter, zoom: initialZoom });
	}

	/**
	 * Loads the wind field used by the particle overlay.
	 *
	 * Kept lazy (only on first toggle) because it costs a handful of upstream
	 * weather probes. The result is cached client-side for 15 minutes, matching
	 * the server's own cache window, so re-toggling does not refetch.
	 */
	async function loadWind(): Promise<void> {
		const FRESH_MS = 15 * 60_000;
		if (windSamples.length && Date.now() - windFetchedAt < FRESH_MS) return;

		windLoading = true;
		windError = null;
		try {
			// The field is assembled from a lattice of upstream probes, so a cold
			// server cache can legitimately take longer than the 15 s default.
			const response = await apiGet<WindPayload>('/api/wind', {}, { timeoutMs: 45000 });
			windSamples = response.data.samples;
			windFetchedAt = Date.now();
			if (!windSamples.length) windError = 'Data angin tidak tersedia saat ini.';
		} catch (error) {
			windError = errorMessage(error);
			windSamples = [];
		} finally {
			windLoading = false;
		}
	}

	function toggleWind(): void {
		showWind = !showWind;
		if (showWind) void loadWind();
	}

	// React to data changes.
	$effect(() => {
		void events;
		updateData();
	});

	// React to theme changes by swapping the basemap style.
	let lastTheme = $state($theme);
	$effect(() => {
		const current = $theme;
		if (current === lastTheme || !map) return;
		lastTheme = current;
		const wasReady = mapReady;
		map.setStyle(styleUrlFor(current));
		if (wasReady) {
			map.once('styledata', () => {
				mapReady = false;
				addSourcesAndLayersLazy();
			});
		}
	});

	async function addSourcesAndLayersLazy(): Promise<void> {
		// Style reload removes sources/layers; re-add then repopulate.
		addSourcesAndLayers();
		mapReady = true;
		updateData();
	}

	$effect(() => {
		void layerVisibility;
		applyFilters();
	});

	onDestroy(() => {
		if (loadWatchdog) clearTimeout(loadWatchdog);
		resizeObserver?.disconnect();
		resizeObserver = null;
		map?.remove();
		map = null;
	});

	const visibleCount = $derived(events.length);

	/** Wind particles read brighter on the dark basemap. */
	const windColor = $derived($theme === 'dark' ? 'rgba(125,211,252,0.9)' : 'rgba(2,132,199,0.85)');
</script>

<div
	class="relative overflow-hidden rounded-xl border border-[var(--border)]"
	style="height:{height}; min-height: 240px"
>
	<div
		bind:this={container}
		class="map-canvas-host absolute inset-0"
		aria-label="Peta interaktif bencana Indonesia"
		role="application"
	></div>

	{#if showWind}
		<WindParticleLayer {map} samples={windSamples} color={windColor} />
	{/if}

	{#if mapError}
		<div class="surface-elevated absolute inset-0 z-[2] flex items-center justify-center p-4">
			<p class="text-subtle max-w-sm text-center text-sm">{mapError}</p>
		</div>
	{/if}

	{#if showControls}
		<!-- Top-left: locate + reset -->
		<div class="absolute top-2 left-2 z-[2] flex flex-col gap-1.5">
			<button
				type="button"
				onclick={locate}
				disabled={locating}
				class="surface-elevated rounded-lg border border-[var(--border)] p-2 shadow-sm transition hover:border-[var(--border-strong)] disabled:opacity-60"
				title="Tampilkan lokasi saya (memerlukan izin)"
				aria-label="Tampilkan lokasi saya"
			>
				<LocateFixed size={16} class={locating ? 'animate-pulse' : ''} />
			</button>
			<button
				type="button"
				onclick={resetView}
				class="surface-elevated rounded-lg border border-[var(--border)] px-2 py-1.5 text-[11px] font-semibold shadow-sm transition hover:border-[var(--border-strong)]"
				title="Kembalikan tampilan ke seluruh Indonesia"
			>
				ID
			</button>
		</div>

		<!-- Layer toggle -->
		<div class="absolute top-2 right-2 z-[2]">
			<button
				type="button"
				onclick={() => (showLayers = !showLayers)}
				class="surface-elevated flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-[11px] font-semibold shadow-sm"
				aria-expanded={showLayers}
				aria-controls="map-layer-panel"
			>
				<Layers size={14} />
				Lapisan
			</button>

			{#if showLayers}
				<div
					id="map-layer-panel"
					class="surface-elevated absolute right-0 mt-1.5 w-56 rounded-lg border border-[var(--border)] p-3 shadow-lg"
				>
					<div class="mb-2 flex items-center justify-between">
						<p class="eyebrow">Kategori data</p>
						<button
							type="button"
							onclick={() => (showLayers = false)}
							aria-label="Tutup panel lapisan"
						>
							<X size={14} />
						</button>
					</div>
					<ul class="space-y-1.5">
						{#each Object.keys(layerVisibility) as key (key)}
							<li>
								<label class="flex cursor-pointer items-center gap-2 text-xs">
									<input
										type="checkbox"
										bind:checked={layerVisibility[key as keyof typeof layerVisibility]}
										class="h-3.5 w-3.5 accent-sky-600"
									/>
									<span>{CATEGORY_LABELS[key] ?? key}</span>
								</label>
							</li>
						{/each}
					</ul>

					<div class="mt-3 border-t border-[var(--border)] pt-3">
						<label class="flex cursor-pointer items-center gap-2 text-xs">
							<input
								type="checkbox"
								checked={showWind}
								onchange={toggleWind}
								class="h-3.5 w-3.5 accent-sky-600"
							/>
							<span class="flex items-center gap-1">
								<Compass size={12} />
								Aliran angin
							</span>
						</label>
						{#if showWind}
							<p class="text-subtle mt-1.5 pl-6 text-[10px] leading-snug">
								{#if windLoading}
									Memuat data angin…
								{:else if windError}
									{windError}
								{:else}
									Perkiraan arah angin dari prakiraan BMKG pada titik provinsi.
								{/if}
							</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Legend -->
		<div
			class="surface-elevated/95 pointer-events-none absolute bottom-6 left-2 z-[2] hidden rounded-lg border border-[var(--border)] px-2.5 py-2 text-[10px] shadow-sm sm:block"
		>
			<p class="eyebrow mb-1">Tingkat keparahan</p>
			<ul class="space-y-0.5">
				{#each Object.entries(SEVERITY_TOKENS) as [key, token] (key)}
					<li class="flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{token.hex}"
						></span>
						<span>{token.shortLabel}</span>
					</li>
				{/each}
			</ul>
		</div>

		<!-- Compass rose: shows which way north points as the map is rotated -->
		<div
			class="surface-elevated/95 pointer-events-none absolute right-2 bottom-9 z-[2] hidden h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] shadow-sm sm:flex"
			aria-hidden="true"
		>
			<div class="relative h-full w-full" style="transform: rotate({-mapBearing}deg)">
				<span class="absolute top-0.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-500"
					>U</span
				>
				<span class="absolute top-1/2 right-1 -translate-y-1/2 text-[9px] font-semibold">T</span>
				<span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-semibold">S</span
				>
				<span class="absolute top-1/2 left-1 -translate-y-1/2 text-[9px] font-semibold">B</span>
				<!-- Needle -->
				<svg
					class="absolute inset-0 m-auto h-4 w-4 text-red-500"
					viewBox="0 0 24 24"
					fill="currentColor"
				>
					<path d="M12 2 8 20l4-3 4 3z" />
				</svg>
			</div>
		</div>

		<!-- Live count -->
		<div
			class="surface-elevated/95 absolute right-2 bottom-2 z-[2] rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium shadow-sm"
		>
			{visibleCount} peristiwa dipetakan
		</div>
	{/if}

	{#if locationNotice}
		<div
			class="absolute right-2 bottom-14 left-2 z-[2] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100"
			role="status"
		>
			{locationNotice}
			<p class="mt-0.5 text-[10px] opacity-80">
				Lokasi Anda hanya dipakai di perangkat ini untuk memusatkan peta dan tidak dikirim ke
				penyedia data.
			</p>
		</div>
	{/if}
</div>
