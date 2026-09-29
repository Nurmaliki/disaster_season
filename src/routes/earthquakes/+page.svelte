<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { apiGet } from '$lib/api/client';
	import type { DisasterEvent } from '$lib/types';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import ErrorPanel from '$lib/components/ui/ErrorPanel.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import MapView from '$lib/components/map/MapView.svelte';
	import { uniqueBy } from '$lib/utils/collections';
	import { RefreshCw, Activity, Info } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const seed = untrack(() => data);

	let quakes = $state<DisasterEvent[]>(seed.quakes);
	let updatedAt = $state(seed.updatedAt);
	let cached = $state(seed.cached);
	let stale = $state(seed.stale);
	let partial = $state(seed.degraded);
	let error = $state<string | null>(seed.error);
	let refreshing = $state(false);

	let minMagnitude = $state(0);
	let tsunamiOnly = $state(false);

	const filtered = $derived(
		uniqueBy(
			quakes
				.filter((q) => {
					const magnitude = Number(q.metadata?.magnitude);
					return !Number.isFinite(magnitude) || magnitude >= minMagnitude;
				})
				.filter((q) => !tsunamiOnly || q.metadata?.tsunamiPotential === true),
			(q) => q.id
		)
	);

	const stats = $derived.by(() => {
		const magnitudes = quakes
			.map((q) => Number(q.metadata?.magnitude))
			.filter((m) => Number.isFinite(m));
		return {
			total: quakes.length,
			max: magnitudes.length ? Math.max(...magnitudes) : null,
			felt: quakes.filter((q) => Boolean(q.metadata?.feltText)).length,
			tsunami: quakes.filter((q) => q.metadata?.tsunamiPotential === true).length
		};
	});

	async function refresh(): Promise<void> {
		refreshing = true;
		try {
			const response = await apiGet<DisasterEvent[]>('/api/earthquakes', { limit: 200 });
			quakes = uniqueBy(response.data, (q) => q.id);
			updatedAt = response.meta.updatedAt;
			cached = response.meta.cached;
			stale = response.meta.stale ?? false;
			partial = response.meta.partial ?? false;
			error = null;
		} catch {
			if (!quakes.length) {
				error = 'Data gempa tidak dapat dimuat. Sumber BMKG mungkin sedang tidak dapat dijangkau.';
			}
		} finally {
			refreshing = false;
		}
	}
</script>

<svelte:head>
	<title>Gempa Bumi Terbaru BMKG — Riwayat Gempa Indonesia</title>
	<meta
		name="description"
		content="Daftar gempa bumi terbaru dan riwayat gempa Indonesia dari BMKG. Aplikasi ini menampilkan gempa yang sudah terjadi dan tidak memprediksi gempa."
	/>
</svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Gempa Bumi"
		subtitle="Gempa yang sudah terjadi menurut BMKG. Aplikasi ini tidak memprediksi gempa bumi."
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

	<InlineNotice tone="info" title="Catatan penting">
		Pemantauan gempa bersifat <strong>setelah kejadian</strong>. Tidak ada teknologi yang dapat
		memprediksi gempa bumi. Untuk informasi resmi, rujuk ke BMKG.
	</InlineNotice>

	{#if error && quakes.length === 0}
		<ErrorPanel message={error} retry={refresh} />
	{:else}
		<!-- Quick stats -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="card p-3">
				<p class="eyebrow">Total tercatat</p>
				<p class="mt-0.5 text-xl font-bold tabular-nums">{stats.total}</p>
			</div>
			<div class="card p-3">
				<p class="eyebrow">Magnitudo tertinggi</p>
				<p class="mt-0.5 text-xl font-bold tabular-nums">
					{stats.max !== null ? `M ${stats.max.toFixed(1).replace('.', ',')}` : '—'}
				</p>
			</div>
			<div class="card p-3">
				<p class="eyebrow">Dirasakan</p>
				<p class="mt-0.5 text-xl font-bold tabular-nums">{stats.felt}</p>
			</div>
			<div class="card p-3">
				<p class="eyebrow">Berpotensi tsunami</p>
				<p
					class="mt-0.5 text-xl font-bold tabular-nums {stats.tsunami > 0
						? 'text-sky-600 dark:text-sky-400'
						: ''}"
				>
					{stats.tsunami}
				</p>
			</div>
		</div>

		{#if filtered.length > 0}
			<div class="overflow-hidden rounded-xl border border-[var(--border)]">
				<MapView events={filtered} height="360px" syncUrl={false} />
			</div>
		{/if}

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-3">
			<label class="flex items-center gap-2 text-xs">
				<span class="text-muted font-semibold">Magnitudo minimal:</span>
				<input
					type="range"
					min="0"
					max="7"
					step="0.5"
					bind:value={minMagnitude}
					class="accent-sky-600"
				/>
				<span class="tabular-nums">M {minMagnitude.toFixed(1).replace('.', ',')}</span>
			</label>

			<label class="flex items-center gap-1.5 text-xs">
				<input type="checkbox" bind:checked={tsunamiOnly} class="h-3.5 w-3.5 accent-sky-600" />
				<span class="font-medium">Hanya berpotensi tsunami</span>
			</label>

			<span class="text-subtle ml-auto text-xs">{filtered.length} gempa ditampilkan</span>
		</div>

		{#if quakes.length === 0}
			<InlineNotice tone="neutral">Belum ada data gempa yang tersedia saat ini.</InlineNotice>
		{:else}
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each filtered as event (event.id)}
					<EventCard {event} />
				{:else}
					<InlineNotice tone="neutral">Tidak ada gempa yang cocok dengan filter ini.</InlineNotice>
				{/each}
			</div>
		{/if}

		<div class="card flex items-start gap-2 p-3">
			<Info size={14} class="text-subtle mt-0.5 shrink-0" aria-hidden="true" />
			<p class="text-subtle text-[11px]">
				<span class="text-muted inline-flex items-center gap-1 font-semibold">
					<Activity size={11} /> Tingkat keparahan gempa pada kartu di atas dihitung oleh aplikasi
				</span>
				berdasarkan magnitudo dan kedalaman, dan bukan klasifikasi resmi BMKG. Klasifikasi resmi mengikuti
				informasi BMKG.
			</p>
		</div>

		<DataStatusBar source="BMKG — Gempa Bumi" {updatedAt} {cached} {stale} {partial} />
	{/if}
</div>
