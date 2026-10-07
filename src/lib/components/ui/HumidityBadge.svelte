<script lang="ts">
	import { Droplets } from 'lucide-svelte';
	import { classifyHumidity } from '$lib/utils/humidity';
	import { formatHumidity } from '$lib/utils/format';

	interface Props {
		/** Relative humidity in percent, or null when unavailable. */
		humidity: number | null | undefined;
		/** Show the word label ("Lembap") next to the value. */
		showLabel?: boolean;
		size?: 'sm' | 'md' | 'lg';
	}

	let { humidity, showLabel = true, size = 'sm' }: Props = $props();

	const band = $derived(classifyHumidity(humidity));

	const SIZES = {
		sm: { wrap: 'px-2 py-0.5 text-[11px] gap-1', icon: 12, value: '' },
		md: { wrap: 'px-2.5 py-1 text-xs gap-1.5', icon: 13, value: '' },
		lg: { wrap: 'px-3 py-1.5 text-sm gap-1.5', icon: 15, value: 'font-semibold' }
	};

	const s = $derived(SIZES[size]);
</script>

{#if band}
	<span
		class="inline-flex items-center rounded-md font-semibold {band.badgeClass} {s.wrap}"
		title="Kelembapan {formatHumidity(
			humidity
		)} — {band.description}. Klasifikasi internal, bukan produk resmi BMKG."
		aria-label="Kelembapan {formatHumidity(humidity)}, {band.label}"
	>
		<Droplets size={s.icon} aria-hidden="true" />
		<span class="tabular-nums {s.value}">{formatHumidity(humidity)}</span>
		{#if showLabel}
			<span class="font-medium opacity-80">{band.label}</span>
		{/if}
	</span>
{:else}
	<span
		class="text-subtle inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
		title="Kelembapan tidak tersedia"
	>
		<Droplets size={12} aria-hidden="true" />
		—
	</span>
{/if}
