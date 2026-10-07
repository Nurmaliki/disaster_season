<script lang="ts">
	import type { WeatherSlot } from '$lib/api/types';
	import { formatTime } from '$lib/utils/format';

	/**
	 * A compact sparkline of relative humidity across the next forecast slots.
	 *
	 * It is a plain inline SVG (no chart dependency) so it stays inside the
	 * project's "no heavyweight dependency" rule. Every point carries an
	 * accessible description and the axis is always labelled in %.
	 */
	interface Props {
		slots: WeatherSlot[];
		/** How many upcoming slots to plot (BMKG serves 3-hourly slots). */
		limit?: number;
		height?: number;
	}

	let { slots, limit = 8, height = 120 }: Props = $props();

	const points = $derived(
		slots.filter((slot) => slot.humidity !== null).slice(0, limit) as Array<
			WeatherSlot & { humidity: number }
		>
	);

	// Fixed viewBox; the SVG scales to its container.
	const VB_W = 320;
	// Leave room for an axis label row at the bottom.
	const VB_H = 100;
	const PAD_X = 8;
	const PAD_TOP = 10;

	// Humidity is always 0–100 %, so the y-scale is stable and comparable.
	const plotW = VB_W - PAD_X * 2;
	const plotH = VB_H - PAD_TOP - 18;

	const coords = $derived(
		points.map((slot, index) => {
			const x = PAD_X + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
			const y = PAD_TOP + plotH * (1 - slot.humidity / 100);
			return { x, y, slot };
		})
	);

	const linePath = $derived(
		coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
	);

	const areaPath = $derived(
		coords.length > 0
			? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)} Z`
			: ''
	);

	// Gridlines at 25 / 50 / 75 % for reference.
	const gridLines = [25, 50, 75].map((value) => ({
		value,
		y: PAD_TOP + plotH * (1 - value / 100)
	}));

	// Sub-sample x-axis labels so they don't collide on narrow screens.
	const labelEvery = $derived(Math.max(1, Math.ceil(coords.length / 4)));
</script>

{#if points.length >= 2}
	<figure class="m-0">
		<svg
			viewBox="0 0 {VB_W} {VB_H}"
			class="w-full"
			style="height:{height}px"
			role="img"
			aria-label="Grafik tren kelembapan {points.length} jam ke depan: {points
				.map((p) => `${formatTime(p.datetime, p.timezone)} ${p.humidity}%`)
				.join(', ')}"
			preserveAspectRatio="none"
		>
			<defs>
				<linearGradient id="humidity-area" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.22" />
					<stop offset="100%" stop-color="#0ea5e9" stop-opacity="0" />
				</linearGradient>
			</defs>

			<!-- Reference gridlines -->
			{#each gridLines as grid (grid.value)}
				<line
					x1={PAD_X}
					y1={grid.y}
					x2={VB_W - PAD_X}
					y2={grid.y}
					stroke="var(--border)"
					stroke-width="0.5"
					stroke-dasharray="3 3"
				/>
			{/each}

			{#if areaPath}
				<path d={areaPath} fill="url(#humidity-area)" />
			{/if}
			<path
				d={linePath}
				fill="none"
				stroke="#0ea5e9"
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
				vector-effect="non-scaling-stroke"
			/>

			{#each coords as c (c.slot.datetime)}
				<circle cx={c.x} cy={c.y} r="2.5" fill="#0ea5e9" vector-effect="non-scaling-stroke" />
			{/each}
		</svg>

		<!-- Axis labels: time per slot. -->
		<div class="mt-1 flex justify-between text-[9px] text-[var(--color-subtle)]">
			{#each coords as c, i (c.slot.datetime)}
				{#if i % labelEvery === 0 || i === coords.length - 1}
					<span class="tabular-nums"
						>{formatTime(c.slot.datetime, c.slot.timezone).split(' ')[0]}</span
					>
				{/if}
			{/each}
		</div>
		<figcaption class="text-subtle mt-1 text-[10px]">
			Tren kelembapan relatif (%) — prakiraan BMKG, klasifikasi internal.
		</figcaption>
	</figure>
{:else}
	<p class="text-subtle text-[11px]">Data tren kelembapan belum cukup untuk digambarkan.</p>
{/if}
