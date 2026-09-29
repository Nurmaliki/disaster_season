<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import { CalendarRange, Info, CloudRain, Sun, CloudSun } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const season = $derived(data.season);

	const PHASE_ICON = { hujan: CloudRain, kemarau: Sun, pancaroba: CloudSun };
	const PhaseIcon = $derived(PHASE_ICON[season.phase] ?? CloudSun);

	const MONTHS = [
		'Januari',
		'Februari',
		'Maret',
		'April',
		'Mei',
		'Juni',
		'Juli',
		'Agustus',
		'September',
		'Oktober',
		'November',
		'Desember'
	];

	const PHASE_TONE = {
		hujan: 'border-sky-300/70 dark:border-sky-500/40',
		kemarau: 'border-amber-300/70 dark:border-amber-500/40',
		pancaroba: 'border-violet-300/70 dark:border-violet-500/40'
	};
</script>

<svelte:head>
	<title>Musim Indonesia — Konteks Musim Hujan &amp; Kemarau</title>
	<meta
		name="description"
		content="Konteks musim Indonesia saat ini: musim hujan, kemarau, atau pancaroba, berdasarkan pola monsoon BMKG."
	/>
</svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Musim"
		subtitle="Konteks musim nasional saat ini dan kaitannya dengan risiko hidrometeorologi."
	/>

	<section class="card p-4 {PHASE_TONE[season.phase]}" aria-labelledby="season-heading">
		<div class="flex items-center gap-3">
			<span class="surface-subtle grid h-12 w-12 shrink-0 place-items-center rounded-xl">
				<PhaseIcon size={24} class="text-muted" />
			</span>
			<div>
				<h2 id="season-heading" class="text-lg font-bold">{season.phaseLabel}</h2>
				<p class="text-subtle text-xs">
					{season.explanation} · {MONTHS[season.month - 1]}
					{season.year}
				</p>
			</div>
		</div>
		<p class="text-muted mt-3 text-xs">
			Bulan-bulan yang biasanya berada pada fase ini: <strong>{season.typicalMonths}</strong>.
		</p>
	</section>

	<section class="card p-4">
		<h2 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
			<Info size={15} aria-hidden="true" /> Yang perlu dipahami
		</h2>
		<ul class="text-subtle space-y-1.5 text-xs">
			{#each season.notes as note (note)}
				<li class="flex items-start gap-1.5">
					<span
						class="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-current"
						aria-hidden="true"
					></span>
					<span>{note}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section aria-labelledby="hydro-heading" class="space-y-2">
		<h2 id="hydro-heading" class="flex items-center gap-1.5 text-sm font-semibold">
			<CalendarRange size={15} aria-hidden="true" /> Peristiwa Hidrometeorologi Terkini
		</h2>
		<p class="text-subtle text-xs">
			Peristiwa banjir, tanah longsor, kekeringan, karhutla, dan cuaca ekstrem yang tercatat.
			Kejadian ini
			<strong>berada pada periode musim</strong> tersebut, tidak serta-merta disebabkan oleh musim.
		</p>

		{#if data.hydroEvents.length > 0}
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.hydroEvents as event (event.id)}
					<EventCard {event} compact />
				{/each}
			</div>
		{:else}
			<InlineNotice tone="neutral">
				Belum ada peristiwa hidrometeorologi pada data yang tersedia saat ini.
			</InlineNotice>
		{/if}
	</section>

	<InlineNotice tone="info">
		Konteks musim di halaman ini bersifat kasar dan nasional. Untuk prakiraan awal musim per
		wilayah, rujuk produk resmi BMKG. Selalu ikuti informasi BMKG, BNPB, BPBD, dan PVMBG untuk
		keputusan keselamatan.
	</InlineNotice>

	<DataStatusBar
		source="Konteks musiman (pola monsoon BMKG)"
		updatedAt={data.updatedAt}
		cached
		partial={data.partial}
	/>
</div>
