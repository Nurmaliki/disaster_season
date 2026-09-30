<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { DisasterEvent } from '$lib/types';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import ErrorPanel from '$lib/components/ui/ErrorPanel.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import MapView from '$lib/components/map/MapView.svelte';
	import { apiGet } from '$lib/api/client';
	import { RefreshCw, Flame, Info } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	interface WildfirePayload {
		hotspots: DisasterEvent[];
		configured: boolean;
		updatedAt: string;
		cached: boolean;
		stale: boolean;
		degraded: boolean;
		error: string | null;
	}

	const seed = untrack(() => data) as unknown as WildfirePayload;

	let hotspots = $state<DisasterEvent[]>(seed.hotspots);
	let updatedAt = $state(seed.updatedAt);
	let cached = $state(seed.cached);
	let stale = $state(seed.stale);
	let partial = $state(seed.degraded);
	let error = $state<string | null>(seed.error);
	let configured = $state(seed.configured);
	let refreshing = $state(false);

	let confidenceFilter = $state<'all' | 'high' | 'moderate' | 'low'>('all');

	/** Hotspots always carry coordinates, but guard against any malformed event. */
	const mapped = $derived(
		hotspots.filter((event) => {
			const { latitude, longitude } = event.location;
			return Number.isFinite(latitude) && Number.isFinite(longitude);
		})
	);

	/** Confidence band derived from our own severity mapping (see normalizer). */
	function confidenceOf(event: DisasterEvent): 'high' | 'moderate' | 'low' | 'unknown' {
		const severity = event.severity;
		if (severity === 'high' || severity === 'moderate' || severity === 'low') return severity;
		return 'unknown';
	}

	const filtered = $derived(
		confidenceFilter === 'all'
			? hotspots
			: hotspots.filter((event) => confidenceOf(event) === confidenceFilter)
	);

	const counts = $derived({
		high: hotspots.filter((e) => confidenceOf(e) === 'high').length,
		moderate: hotspots.filter((e) => confidenceOf(e) === 'moderate').length,
		low: hotspots.filter((e) => confidenceOf(e) === 'low').length
	});

	async function refresh(): Promise<void> {
		refreshing = true;
		try {
			const response = await apiGet<DisasterEvent[]>('/api/events', {
				types: 'wildfire',
				limit: 300
			});
			hotspots = response.data.filter((event) => event.type === 'wildfire');
			updatedAt = response.meta.updatedAt;
			cached = response.meta.cached;
			stale = response.meta.stale ?? false;
			partial = response.meta.partial ?? false;
			error = null;
		} catch {
			if (!hotspots.length) {
				error =
					'Data titik panas tidak dapat dimuat. Sumber NASA FIRMS mungkin sedang tidak dapat dijangkau.';
			}
		} finally {
			refreshing = false;
		}
	}
</script>

<svelte:head>
	<title>Karhutla — Titik Panas (Hotspot) Indonesia — NASA FIRMS</title>
	<meta
		name="description"
		content="Deteksi titik panas (hotspot) kebakaran hutan dan lahan Indonesia dari satelit NASA FIRMS. Deteksi anomali termal, bukan kebakaran yang terkonfirmasi."
	/>
</svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Karhutla — Titik Panas"
		subtitle="Deteksi anomali termal satelit (NASA FIRMS) untuk kebakaran hutan dan lahan. Titik panas adalah deteksi, bukan kebakaran yang terkonfirmasi."
	>
		{#snippet actions()}
			<button
				type="button"
				onclick={refresh}
				disabled={refreshing || !configured}
				class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--border-strong)] disabled:opacity-60"
			>
				<RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
				Perbarui
			</button>
		{/snippet}
	</PageHeader>

	{#if !configured}
		<InlineNotice tone="warning">
			Fitur titik panas belum diaktifkan pada deployment ini. Sumber NASA FIRMS memerlukan kunci API
			(<code class="text-[11px]">FIRMS_MAP_KEY</code>) yang dapat diperoleh gratis. Tanpa kunci,
			tidak ada deteksi yang ditampilkan — dan tidak ada titik yang dikarang.
		</InlineNotice>
	{:else if error && hotspots.length === 0}
		<ErrorPanel message={error} retry={refresh} />
	{:else}
		<!-- Confidence summary -->
		<div class="grid grid-cols-3 gap-3">
			{#each [['high', 'Tinggi'], ['moderate', 'Sedang'], ['low', 'Rendah']] as [key, label] (key)}
				<div class="card p-3">
					<p class="eyebrow">Kepercayaan {label}</p>
					<p class="mt-0.5 text-xl font-bold tabular-nums">{counts[key as keyof typeof counts]}</p>
				</div>
			{/each}
		</div>

		{#if mapped.length > 0}
			<div class="overflow-hidden rounded-xl border border-[var(--border)]">
				<MapView
					events={mapped}
					height="360px"
					syncUrl={false}
					clusterMaxZoom={7}
					initialZoom={4.5}
				/>
			</div>
		{/if}

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-muted text-xs font-semibold">Filter kepercayaan:</span>
			{#each [['all', 'Semua'], ['high', 'Tinggi'], ['moderate', 'Sedang'], ['low', 'Rendah']] as [key, label] (key)}
				<button
					type="button"
					onclick={() => (confidenceFilter = key as typeof confidenceFilter)}
					class="rounded-full border px-2.5 py-1 text-[11px] font-medium transition {confidenceFilter ===
					key
						? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
						: 'text-muted border-[var(--border)] hover:border-[var(--border-strong)]'}"
				>
					{label}
				</button>
			{/each}
			<span class="text-subtle ml-auto text-xs">{filtered.length} titik panas</span>
		</div>

		{#if hotspots.length === 0}
			<InlineNotice tone="neutral">
				Tidak ada titik panas yang terdeteksi saat ini. Pada periode tanpa deteksi, ini normal —
				bukan berarti tidak ada data.
			</InlineNotice>
		{:else}
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each filtered.slice(0, 300) as event (event.id)}
					<EventCard {event} />
				{:else}
					<InlineNotice tone="neutral"
						>Tidak ada titik panas pada tingkat kepercayaan ini.</InlineNotice
					>
				{/each}
			</div>
		{/if}

		<div class="card flex items-start gap-2 p-3">
			<Info size={14} class="text-subtle mt-0.5 shrink-0" aria-hidden="true" />
			<p class="text-subtle text-[11px]">
				<span class="text-muted inline-flex items-center gap-1 font-semibold">
					<Flame size={11} /> Titik panas bukan kebakaran terkonfirmasi
				</span>
				— ini deteksi anomali termal satelit (NASA FIRMS). Tingkat kepercayaan adalah klasifikasi kami
				berdasarkan nilai kepercayaan deteksi, bukan penilaian bahaya oleh otoritas. Verifikasi dengan
				sumber resmi (KLHK/Sipongi, BPBD setempat).
			</p>
		</div>

		<DataStatusBar
			source="NASA FIRMS — Titik Panas (Hotspot)"
			{updatedAt}
			{cached}
			{stale}
			{partial}
		/>
	{/if}
</div>
