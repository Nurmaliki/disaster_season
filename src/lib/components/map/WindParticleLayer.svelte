<script lang="ts" module>
	import type { WindSample } from '$lib/api/types';

	/**
	 * Inverse-distance-weighted wind at a lon/lat.
	 *
	 * The field is a handful of scattered probes, not a grid, so a smooth
	 * everywhere-defined vector is produced by weighting each sample by 1/d².
	 * Near a probe the nearest sample dominates (so the animation reads as the
	 * local forecast); between probes the field blends, which is what makes the
	 * particles look continuous instead of snapping to isolated spokes.
	 *
	 * Longitude is scaled by cos(lat) so distances are metric rather than
	 * degree-space, otherwise a degree of longitude at high latitude would be
	 * over-weighted relative to a degree of latitude.
	 */
	export function sampleWind(
		lon: number,
		lat: number,
		samples: WindSample[]
	): { u: number; v: number } | null {
		if (!samples.length) return null;

		const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6;
		let weightSum = 0;
		let u = 0;
		let v = 0;
		let exact: WindSample | null = null;
		let nearestDeg2 = Infinity;

		for (const s of samples) {
			const dx = (lon - s.longitude) * cosLat;
			const dy = lat - s.latitude;
			const d2 = dx * dx + dy * dy;

			if (d2 < nearestDeg2) nearestDeg2 = d2;

			// Within ~1 km, take the probe as-is to avoid a singularity.
			if (d2 < 1e-4) {
				exact = s;
				break;
			}

			const w = 1 / (d2 * d2);
			weightSum += w;
			u += w * s.u;
			v += w * s.v;
		}

		if (exact) return { u: exact.u, v: exact.v };

		// Outside the probing lattice (roughly: farther than ~8° from the
		// nearest probe) the interpolation would be extrapolating from points
		// hundreds of kilometres away, producing a plausible-looking but
		// meaningless vector. Report "no data" there so those particles simply
		// do not render, rather than inventing wind over the ocean off-grid.
		if (nearestDeg2 > 8 * 8) return null;

		if (weightSum === 0) return null;
		return { u: u / weightSum, v: v / weightSum };
	}
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Map as MaplibreMap } from 'maplibre-gl';

	interface Props {
		map: MaplibreMap | null;
		samples: WindSample[];
		/** Particle stroke colour (any CSS colour). */
		color?: string;
		/** Particles drawn at once. Lower on small screens for battery. */
		density?: number;
	}

	let { map, samples, color = 'rgba(56,189,248,0.85)', density = 0 }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();

	let rafId: number | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let width = 0;
	let height = 0;

	// Particle state kept in parallel typed arrays for speed.
	let particleLon: Float32Array = new Float32Array(0);
	let particleLat: Float32Array = new Float32Array(0);
	let particleAge: Float32Array = new Float32Array(0);
	let count = 0;

	// Screen positions from the previous frame, kept so each particle can be
	// stroked as a short segment from where it was to where it is now.
	let prevX: Float32Array = new Float32Array(0);
	let prevY: Float32Array = new Float32Array(0);
	let hasPrev: boolean[] = [];

	/** Base particle count, tuned by viewport area but capped for large screens. */
	function particleBudget(): number {
		if (density > 0) return density;
		const area = width * height;
		// Denser than before: with viewport-relative seeding every particle is
		// actually on screen, so a higher count reads as continuous flow rather
		// than a sparse scatter (the old bug was that most particles sat off-screen).
		return Math.round(Math.min(5000, Math.max(1200, area / 450)));
	}

	// Indonesia's bounding box, padded a little. Used as a fallback when the map
	// is not ready to report its viewport, and to keep respawns on Indonesian
	// soil when zoomed all the way out.
	const SEED_BOUNDS = { minLon: 92, maxLon: 144, minLat: -13, maxLat: 9 };

	/**
	 * Current visible geographic bounds, padded by `pad` so particles can flow in
	 * from just off-screen before entering. Returns null if the map cannot be
	 * projected yet.
	 *
	 * Seeding inside the viewport (rather than the whole archipelago) is what
	 * keeps particle density constant at every zoom level: previously a zoomed-in
	 * view showed only the ~0.4% of particles that happened to fall inside it.
	 */
	function viewportBounds(pad = 0.25): {
		minLon: number;
		maxLon: number;
		minLat: number;
		maxLat: number;
	} | null {
		if (!map || width <= 0 || height <= 0) return null;
		try {
			const sw = map.unproject([-pad * width, height + pad * height]);
			const ne = map.unproject([width + pad * width, -pad * height]);
			const minLon = Math.max(-180, Math.min(sw.lng, ne.lng));
			const maxLon = Math.min(180, Math.max(sw.lng, ne.lng));
			const minLat = Math.max(-85, Math.min(sw.lat, ne.lat));
			const maxLat = Math.min(85, Math.max(sw.lat, ne.lat));
			if (!(maxLon > minLon) || !(maxLat > minLat)) return null;
			return { minLon, maxLon, minLat, maxLat };
		} catch {
			return null;
		}
	}

	function respawn(i: number): void {
		const b = viewportBounds() ?? SEED_BOUNDS;
		particleLon[i] = b.minLon + Math.random() * (b.maxLon - b.minLon);
		particleLat[i] = b.minLat + Math.random() * (b.maxLat - b.minLat);
		particleAge[i] = Math.random() * 80;
		hasPrev[i] = false;
	}

	function seed(): void {
		count = particleBudget();
		particleLon = new Float32Array(count);
		particleLat = new Float32Array(count);
		particleAge = new Float32Array(count);
		prevX = new Float32Array(count);
		prevY = new Float32Array(count);
		hasPrev = new Array(count).fill(false);
		for (let i = 0; i < count; i++) respawn(i);
	}

	function resize(): void {
		if (!canvas || !map) return;
		const host = map.getContainer();
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		width = host.clientWidth;
		height = host.clientHeight;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		const ctx = canvas.getContext('2d');
		if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		seed();
	}

	/** One animation step. Returns the number of particles step-drawn. */
	function step(ctx: CanvasRenderingContext2D): void {
		if (!map || !samples.length) return;

		// Refresh the (padded) viewport bounds once per frame; panning/zooming
		// then narrows the recycle test below automatically.
		const bounds = viewportBounds(0.15);

		// Fade the previous frame slightly so moving heads leave short trails
		// instead of a solid smear.
		ctx.globalCompositeOperation = 'destination-in';
		ctx.fillStyle = 'rgba(0,0,0,0.86)';
		ctx.fillRect(0, 0, width, height);
		ctx.globalCompositeOperation = 'source-over';

		ctx.strokeStyle = color;
		ctx.lineWidth = 1.1;
		ctx.lineCap = 'round';
		ctx.beginPath();

		// Degrees per step is small; scaled so visible motion reads as "flow".
		const stepDeg = 0.06;

		for (let i = 0; i < count; i++) {
			let lon = particleLon[i];
			let lat = particleLat[i];

			const wind = sampleWind(lon, lat, samples);
			if (!wind) {
				respawn(i);
				continue;
			}

			// Magnitude in km/h → a gentle visual speed; zero-wind particles
			// just die and respawn.
			const speed = Math.hypot(wind.u, wind.v);
			if (speed < 0.5) {
				respawn(i);
				continue;
			}

			const scale = stepDeg * 0.02;
			lon += wind.u * scale;
			lat += wind.v * scale;

			// Recycle particles that wandered off the map or lived too long.
			particleAge[i] += 1;
			if (particleAge[i] > 120 || lon < -180 || lon > 180 || lat < -85 || lat > 85) {
				respawn(i);
				continue;
			}

			// Also recycle when the particle drifts outside the (padded) viewport,
			// so panning/zooming keeps the whole budget on screen instead of
			// silently animating particles the user cannot see.
			const b = bounds;
			if (b && (lon < b.minLon || lon > b.maxLon || lat < b.minLat || lat > b.maxLat)) {
				respawn(i);
				continue;
			}

			particleLon[i] = lon;
			particleLat[i] = lat;

			const p = map.project([lon, lat]);
			if (hasPrev[i] && p.x >= -20 && p.x <= width + 20 && p.y >= -20 && p.y <= height + 20) {
				// A big jump means the particle crossed the antimeridian or the
				// map moved a lot; drawing it would be a long misplaced streak.
				const dx = p.x - prevX[i];
				const dy = p.y - prevY[i];
				if (dx * dx + dy * dy < 40 * 40) {
					ctx.moveTo(prevX[i], prevY[i]);
					ctx.lineTo(p.x, p.y);
				}
			}

			prevX[i] = p.x;
			prevY[i] = p.y;
			hasPrev[i] = true;
		}

		ctx.stroke();
	}

	function loop(): void {
		rafId = requestAnimationFrame(loop);
		const ctx = canvas?.getContext('2d');
		if (!ctx) return;
		step(ctx);
	}

	onMount(() => {
		if (!map || !canvas) return;
		resize();

		resizeObserver = new ResizeObserver(() => resize());
		resizeObserver.observe(map.getContainer());

		// Re-seed on significant view changes so the particle field immediately
		// fills the new viewport (rather than waiting for particles to recycle
		// one by one). Cheap: it just re-randomises coordinates.
		const onMoveEnd = (): void => {
			if (width > 0 && height > 0) seed();
		};
		map.on('moveend', onMoveEnd);

		rafId = requestAnimationFrame(loop);

		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			resizeObserver?.disconnect();
			resizeObserver = null;
			map?.off('moveend', onMoveEnd);
		};
	});

	onDestroy(() => {
		if (rafId !== null) cancelAnimationFrame(rafId);
		resizeObserver?.disconnect();
		resizeObserver = null;
	});

	// Re-seed when the field changes so the new vectors take over immediately.
	$effect(() => {
		void samples;
		if (width > 0 && height > 0) seed();
	});
</script>

<canvas bind:this={canvas} class="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true"
></canvas>
