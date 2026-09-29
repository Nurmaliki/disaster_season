<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { apiGet } from '$lib/api/client';
	import type { VolcanoPayload } from '$lib/api/types';
	import type { DisasterEvent } from '$lib/types';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import ErrorPanel from '$lib/components/ui/ErrorPanel.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import MapView from '$lib/components/map/MapView.svelte';
	import { RefreshCw, Flame, Info } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const seed = untrack(() => data);

	let volcanoes = $state<DisasterEvent[]>(seed.volcanoes);
	let counts = $state<Record<string, number>>(seed.counts);
	let updatedAt = $state(seed.updatedAt);
	let cached = $state(seed.cached);
	let stale = $state(seed.stale);
	let partial = $state(seed.degraded);
	let error = $state<string | null>(seed.error);
	let refreshing = $state(false);

	let levelFilter = $state<'all' | 'I' | 'II' | 'III' | 'IV'>('all');

	const LEVEL_DESCRIPTION: Record<string, string> = {
		I: 'Normal',
		II: 'Waspada',
		III: 'Siaga',
		IV: 'Awas'
	};

	const filtered = $derived(
		levelFilter === 'all' ? volcanoes : volcanoes.filter((v) => v.metadata?.level === levelFilter)
	);

	const mapped = $derived(volcanoes.filter((v) => v.metadata?.coordinatesKnown !== false));

	async function refresh(): Promise<void> {
		refreshing = true;
		try {
			const response = await apiGet<VolcanoPayload>('/api/volcanoes', { limit: 200 });
			volcanoes = response.data.volcanoes;
			counts = response.data.counts;
			updatedAt = response.meta.updatedAt;
			cached = response.meta.cached;
			stale = response.meta.stale ?? false;
			partial = response.meta.partial ?? false;
			error = null;
		} catch {
			if (!volcanoes.length) {
				error =
					'Data gunung api tidak dapat dimuat. Sumber PVMBG/MAGMA mungkin sedang tidak dapat dijangkau.';
			}
		} finally {
			refreshing = false;
		}
	}
</script>

<svelte:head>
	<title>Status Gunung Api Indonesia — PVMBG / MAGMA</title>
	<meta
		name="description"
		content="Tingkat aktivitas resmi gunung api Indonesia (Level I–IV) dari PVMBG/MAGMA."
	/>
</svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Status Gunung Api"
		subtitle="Tingkat aktivitas resmi gunung api Indonesia dari PVMBG/MAGMA. Level I–IV merupakan klasifikasi instansi resmi."
	>
		{#snippet actions()}
			<button
				type="button"
				onclick={refresh}
				disabled={refreshing}
				class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--border-strong)] disabled:opacity-60"
			>
				<RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
				Perbarui
			</button>
		{/snippet}
	</PageHeader>

	{#if error && volcanoes.length === 0}
		<ErrorPanel message={error} retry={refresh} />
	{:else}
		<!-- Level summary -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each ['IV', 'III', 'II', 'I'] as level (level)}
				<div
					class="card p-3 {level === 'IV'
						? 'border-red-300/70 dark:border-red-500/40'
						: level === 'III'
							? 'border-orange-300/70 dark:border-orange-500/40'
							: ''}"
				>
					<p class="eyebrow">Level {level} · {LEVEL_DESCRIPTION[level]}</p>
					<p class="mt-0.5 text-xl font-bold tabular-nums">{counts[level] ?? 0}</p>
				</div>
			{/each}
		</div>

		{#if mapped.length > 0}
			<div class="overflow-hidden rounded-xl border border-[var(--border)]">
				<MapView events={mapped} height="360px" syncUrl={false} />
			</div>
		{/if}

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-muted text-xs font-semibold">Filter level:</span>
			{#each ['all', 'IV', 'III', 'II', 'I'] as level (level)}
				<button
					type="button"
					onclick={() => (levelFilter = level as typeof levelFilter)}
					class="rounded-full border px-2.5 py-1 text-[11px] font-medium transition {levelFilter ===
					level
						? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
						: 'text-muted border-[var(--border)] hover:border-[var(--border-strong)]'}"
				>
					{level === 'all' ? 'Semua' : `Level ${level}`}
				</button>
			{/each}
			<span class="text-subtle ml-auto text-xs">{filtered.length} gunung api</span>
		</div>

		{#if volcanoes.length === 0}
			<InlineNotice tone="neutral">Data aktivitas gunung api belum tersedia saat ini.</InlineNotice>
		{:else}
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each filtered as event (event.id)}
					<EventCard {event} />
				{:else}
					<InlineNotice tone="neutral">Tidak ada gunung api pada level ini.</InlineNotice>
				{/each}
			</div>
		{/if}

		<div class="card flex items-start gap-2 p-3">
			<Info size={14} class="text-subtle mt-0.5 shrink-0" aria-hidden="true" />
			<p class="text-subtle text-[11px]">
				<span class="text-muted inline-flex items-center gap-1 font-semibold">
					<Flame size={11} /> Tingkat aktivitas bersifat resmi
				</span>
				dan berasal dari PVMBG/MAGMA. Gunung api yang koordinatnya tidak dipublikasikan tidak ditampilkan
				pada peta, dan tidak ada koordinat yang dikarang. Status dapat berubah sewaktu-waktu — ikuti pengumuman
				resmi PVMBG.
			</p>
		</div>

		<DataStatusBar source="PVMBG / MAGMA — Gunung Api" {updatedAt} {cached} {stale} {partial} />
	{/if}
</div>
