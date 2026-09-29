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
	import { RefreshCw, TriangleAlert } from 'lucide-svelte';
	import { SEVERITY_ORDER } from '$lib/utils/severity';
	import type { Severity } from '$lib/types';

	let { data }: { data: PageData } = $props();

	// SSR provides the first paint; the client then owns this state and refreshes
	// it via the API. Reading through `untrack` documents that the initial value
	// is intentionally captured only once.
	const seed = untrack(() => data);

	let warnings = $state<DisasterEvent[]>(seed.warnings);
	let updatedAt = $state(seed.updatedAt);
	let stale = $state(seed.stale);
	let partial = $state(seed.degraded);
	let error = $state<string | null>(seed.error);
	let refreshing = $state(false);

	let severityFilter = $state<Severity | 'all'>('all');
	let provinceFilter = $state<'all' | string>('all');

	const provinces = $derived(
		[...new Set(warnings.map((w) => w.location.province).filter(Boolean) as string[])].sort(
			(a, b) => a.localeCompare(b, 'id')
		)
	);

	const filtered = $derived(
		warnings
			.filter((w) => severityFilter === 'all' || w.severity === severityFilter)
			.filter((w) => provinceFilter === 'all' || w.location.province === provinceFilter)
			.sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0))
	);

	async function refresh(): Promise<void> {
		refreshing = true;
		try {
			const response = await apiGet<DisasterEvent[]>('/api/warnings', { limit: 100 });
			warnings = response.data;
			updatedAt = response.meta.updatedAt;
			stale = response.meta.stale ?? false;
			partial = response.meta.partial ?? false;
			error = null;
		} catch {
			if (!warnings.length) {
				error =
					'Peringatan dini tidak dapat dimuat. Sumber BMKG mungkin sedang tidak dapat dijangkau.';
			}
		} finally {
			refreshing = false;
		}
	}
</script>

<svelte:head>
	<title>Peringatan Dini Cuaca BMKG — Disaster Monitor</title>
	<meta
		name="description"
		content="Peringatan dini cuaca resmi BMKG untuk wilayah Indonesia, berdasarkan protokol CAP."
	/>
</svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Peringatan Dini Cuaca"
		subtitle="Peringatan resmi BMKG berbasis protokol CAP. Hanya peringatan yang masih berlaku yang ditampilkan."
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

	{#if error && warnings.length === 0}
		<ErrorPanel message={error} retry={refresh} />
	{:else}
		{#if filtered.length > 0}
			<div class="overflow-hidden rounded-xl border border-[var(--border)]">
				<MapView events={filtered} height="320px" syncUrl={false} />
			</div>
		{/if}

		{#if warnings.length === 0}
			<InlineNotice tone="success" title="Tidak ada peringatan dini aktif">
				BMKG tidak menerbitkan peringatan dini cuaca yang masih berlaku untuk wilayah Indonesia saat
				ini.
			</InlineNotice>
		{:else}
			<div class="flex flex-wrap items-center gap-2">
				<label class="flex items-center gap-1.5 text-xs">
					<span class="text-muted font-semibold">Tingkat:</span>
					<select
						bind:value={severityFilter}
						class="surface-subtle rounded-md border border-[var(--border)] px-2 py-1 text-xs"
					>
						<option value="all">Semua</option>
						<option value="critical">Sangat Tinggi</option>
						<option value="high">Tinggi</option>
						<option value="moderate">Sedang</option>
						<option value="low">Rendah</option>
					</select>
				</label>

				{#if provinces.length > 0}
					<label class="flex items-center gap-1.5 text-xs">
						<span class="text-muted font-semibold">Provinsi:</span>
						<select
							bind:value={provinceFilter}
							class="surface-subtle max-w-[12rem] rounded-md border border-[var(--border)] px-2 py-1 text-xs"
						>
							<option value="all">Semua provinsi</option>
							{#each provinces as province (province)}
								<option value={province}>{province}</option>
							{/each}
						</select>
					</label>
				{/if}

				<span class="text-subtle text-xs">{filtered.length} peringatan ditampilkan</span>
			</div>

			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each filtered as event (event.id)}
					<EventCard {event} />
				{:else}
					<InlineNotice tone="neutral"
						>Tidak ada peringatan yang cocok dengan filter ini.</InlineNotice
					>
				{/each}
			</div>
		{/if}

		<div class="card p-3">
			<p class="text-subtle flex items-start gap-1.5 text-[11px]">
				<TriangleAlert size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
				<span>
					Peringatan dini ini diterbitkan oleh BMKG. Aplikasi menampilkan teks dan waktu berlakunya
					apa adanya. Untuk keputusan keselamatan, selalu rujuk ke situs resmi BMKG.
				</span>
			</p>
		</div>

		<DataStatusBar
			source="BMKG — Peringatan Dini Cuaca (CAP)"
			{updatedAt}
			cached
			{stale}
			{partial}
		/>
	{/if}
</div>
