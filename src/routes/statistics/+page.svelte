<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { apiGet } from '$lib/api/client';
	import type { StatisticsPayload, StatisticsBucket } from '$lib/api/types';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import ErrorPanel from '$lib/components/ui/ErrorPanel.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import { RefreshCw, BarChart3 } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const seed = untrack(() => data);

	let stats = $state<StatisticsPayload | null>(seed.stats);
	let error = $state<string | null>(seed.error);
	let refreshing = $state(false);
	let window = $state<'24h' | '7d' | '30d' | '3m' | '1y'>('7d');

	const WINDOWS = [
		{ key: '24h', label: '24 jam' },
		{ key: '7d', label: '7 hari' },
		{ key: '30d', label: '30 hari' },
		{ key: '3m', label: '3 bulan' },
		{ key: '1y', label: '1 tahun' }
	] as const;

	async function load(next = window): Promise<void> {
		refreshing = true;
		window = next;
		try {
			const response = await apiGet<StatisticsPayload>('/api/statistics', { window: next });
			stats = response.data;
			error = null;
		} catch {
			error = 'Statistik tidak dapat dimuat untuk periode ini.';
		} finally {
			refreshing = false;
		}
	}

	/** Bar width as a percentage of the max count in a bucket list. */
	function barWidth(bucket: StatisticsBucket, list: StatisticsBucket[]): number {
		const max = Math.max(1, ...list.map((b) => b.count));
		return Math.round((bucket.count / max) * 100);
	}
</script>

<svelte:head>
	<title>Statistik Bencana &amp; Cuaca Indonesia — Disaster Monitor</title>
	<meta
		name="description"
		content="Statistik kejadian gempa, peringatan dini, dan gunung api Indonesia berdasarkan data resmi."
	/>
</svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Statistik"
		subtitle="Rekap jumlah peristiwa dalam periode tertentu. Semua angka berasal dari data nyata yang berhasil diambil dari sumber resmi."
	>
		{#snippet actions()}
			<button
				type="button"
				onclick={() => load()}
				disabled={refreshing}
				class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--border-strong)] disabled:opacity-60"
			>
				<RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
				Perbarui
			</button>
		{/snippet}
	</PageHeader>

	<!-- Period selector -->
	<div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Pilih periode">
		{#each WINDOWS as option (option.key)}
			<button
				type="button"
				role="tab"
				aria-selected={window === option.key}
				onclick={() => load(option.key)}
				class="rounded-full border px-3 py-1.5 text-xs font-medium transition {window === option.key
					? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
					: 'text-muted border-[var(--border)] hover:border-[var(--border-strong)]'}"
			>
				{option.label}
			</button>
		{/each}
	</div>

	{#if error && !stats}
		<ErrorPanel message={error} retry={() => load()} />
	{:else if stats}
		<div class="card p-4">
			<p class="eyebrow">
				Total peristiwa dalam {WINDOWS.find((w) => w.key === stats!.window)?.label ?? stats.window}
			</p>
			<p class="mt-1 text-3xl font-bold tabular-nums">{stats.total}</p>
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			<!-- By type -->
			<section class="card p-4">
				<h2 class="mb-3 text-sm font-semibold">Berdasarkan Jenis</h2>
				{#if stats.byType.length === 0}
					<p class="text-subtle text-xs">Tidak ada data pada periode ini.</p>
				{:else}
					<ul class="space-y-2">
						{#each stats.byType as bucket (bucket.key)}
							<li>
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium">{bucket.label}</span>
									<span class="text-subtle tabular-nums">{bucket.count}</span>
								</div>
								<div class="surface-subtle mt-1 h-2 overflow-hidden rounded-full">
									<div
										class="h-full rounded-full bg-sky-500"
										style="width:{barWidth(bucket, stats.byType)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- By severity -->
			<section class="card p-4">
				<h2 class="mb-3 text-sm font-semibold">Berdasarkan Tingkat Keparahan</h2>
				{#if stats.bySeverity.length === 0}
					<p class="text-subtle text-xs">Tidak ada data pada periode ini.</p>
				{:else}
					<ul class="space-y-2">
						{#each stats.bySeverity as bucket (bucket.key)}
							<li>
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium">{bucket.label}</span>
									<span class="text-subtle tabular-nums">{bucket.count}</span>
								</div>
								<div class="surface-subtle mt-1 h-2 overflow-hidden rounded-full">
									<div
										class="h-full rounded-full {bucket.key === 'critical'
											? 'bg-red-600'
											: bucket.key === 'high'
												? 'bg-orange-500'
												: bucket.key === 'moderate'
													? 'bg-amber-500'
													: bucket.key === 'low'
														? 'bg-emerald-500'
														: 'bg-slate-400'}"
										style="width:{barWidth(bucket, stats.bySeverity)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- Magnitude distribution -->
			<section class="card p-4">
				<h2 class="mb-3 text-sm font-semibold">Distribusi Magnitudo Gempa</h2>
				{#if stats.magnitudeBuckets.every((b) => b.count === 0)}
					<p class="text-subtle text-xs">Tidak ada data gempa pada periode ini.</p>
				{:else}
					<ul class="space-y-2">
						{#each stats.magnitudeBuckets as bucket (bucket.key)}
							<li>
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium">M {bucket.label}</span>
									<span class="text-subtle tabular-nums">{bucket.count}</span>
								</div>
								<div class="surface-subtle mt-1 h-2 overflow-hidden rounded-full">
									<div
										class="h-full rounded-full bg-indigo-500"
										style="width:{barWidth(bucket, stats.magnitudeBuckets)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- By category -->
			<section class="card p-4">
				<h2 class="mb-3 text-sm font-semibold">Berdasarkan Kategori Data</h2>
				{#if stats.byCategory.length === 0}
					<p class="text-subtle text-xs">Tidak ada data pada periode ini.</p>
				{:else}
					<ul class="space-y-2">
						{#each stats.byCategory as bucket (bucket.key)}
							<li>
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium">{bucket.label}</span>
									<span class="text-subtle tabular-nums">{bucket.count}</span>
								</div>
								<div class="surface-subtle mt-1 h-2 overflow-hidden rounded-full">
									<div
										class="h-full rounded-full bg-violet-500"
										style="width:{barWidth(bucket, stats.byCategory)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- By source -->
			<section class="card p-4">
				<h2 class="mb-3 text-sm font-semibold">Berdasarkan Sumber</h2>
				{#if stats.bySource.length === 0}
					<p class="text-subtle text-xs">Tidak ada data pada periode ini.</p>
				{:else}
					<ul class="space-y-2">
						{#each stats.bySource as bucket (bucket.key)}
							<li>
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium">{bucket.label}</span>
									<span class="text-subtle tabular-nums">{bucket.count}</span>
								</div>
								<div class="surface-subtle mt-1 h-2 overflow-hidden rounded-full">
									<div
										class="h-full rounded-full bg-teal-500"
										style="width:{barWidth(bucket, stats.bySource)}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>

		{#if stats.total === 0}
			<InlineNotice tone="neutral">
				Belum ada peristiwa tercatat pada periode ini, atau data sumber belum berhasil dimuat. Angka
				nol ditampilkan apa adanya dan tidak ditambah atau diperkirakan.
			</InlineNotice>
		{/if}

		<div class="card flex items-start gap-2 p-3">
			<BarChart3 size={14} class="text-subtle mt-0.5 shrink-0" aria-hidden="true" />
			<p class="text-subtle text-[11px]">
				Statistik dihitung dari peristiwa yang berhasil diambil dari sumber resmi. Jumlah dapat
				berubah seiring data baru. Tidak ada angka yang diperkirakan atau diisi untuk melengkapi
				grafik.
			</p>
		</div>

		<DataStatusBar
			source="BMKG, PVMBG/MAGMA"
			updatedAt={stats.updatedAt}
			cached
			partial={stats.partial}
		/>
	{/if}
</div>
