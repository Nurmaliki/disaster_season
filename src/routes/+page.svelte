<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import { apiGet } from '$lib/api/client';
	import type { DashboardPayload } from '$lib/api/types';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import StatCard from '$lib/components/ui/StatCard.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import ErrorPanel from '$lib/components/ui/ErrorPanel.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import RiskBadge from '$lib/components/ui/RiskBadge.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import TypeIcon from '$lib/components/ui/TypeIcon.svelte';
	import HumidityBadge from '$lib/components/ui/HumidityBadge.svelte';
	import MapView from '$lib/components/map/MapView.svelte';
	import { formatRelative, formatHumidity } from '$lib/utils/format';
	import { HUMIDITY_BANDS } from '$lib/utils/humidity';
	import {
		Activity,
		TriangleAlert,
		Flame,
		RefreshCw,
		ArrowRight,
		Waves,
		CloudLightning,
		Droplets
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// Seed once from SSR; the client owns this state afterwards (polling refresh).
	const seed = untrack(() => data);

	let dashboard = $state<DashboardPayload | null>(seed.dashboard);
	let loadError = $state<string | null>(seed.loadError);
	let refreshing = $state(false);
	let updatedAt = $state(seed.loadedAt);

	let pollTimer: ReturnType<typeof setInterval> | null = null;

	async function refresh(silent = false): Promise<void> {
		if (!silent) refreshing = true;
		try {
			const response = await apiGet<DashboardPayload>('/api/dashboard', { limit: 8 });
			dashboard = response.data;
			updatedAt = response.meta.updatedAt;
			loadError = null;
		} catch {
			// Keep showing the SSR data; only flag the error if we have nothing.
			if (!dashboard) {
				loadError =
					'Data tidak dapat dimuat saat ini. Sumber resmi mungkin sedang tidak dapat dijangkau.';
			}
		} finally {
			refreshing = false;
		}
	}

	$effect(() => {
		pollTimer = setInterval(() => {
			if (document.visibilityState === 'visible') void refresh(true);
		}, 120_000);
		return () => {
			if (pollTimer) clearInterval(pollTimer);
		};
	});

	const warningCount = $derived(dashboard?.activeWarnings.length ?? 0);
	const quakeCount = $derived(dashboard?.recentEarthquakes.length ?? 0);
	const volcanoCount = $derived(dashboard?.activeVolcanoes.length ?? 0);

	// The map shows everything we have, so clicking a marker works from the home page.
	const mapEvents = $derived(dashboard ? dashboard.topEvents : []);
</script>

<svelte:head>
	<title>Indonesia Disaster &amp; Season Monitor — Cuaca, Gempa, dan Peringatan Dini</title>
	<meta
		name="description"
		content="Pemantauan cuaca, musim, peringatan dini BMKG, gempa bumi terbaru, dan aktivitas gunung api Indonesia dari sumber data resmi."
	/>
</svelte:head>

{#if loadError && !dashboard}
	<div class="space-y-4">
		<PageHeader
			title="Ringkasan Hari Ini"
			subtitle="Pemantauan kondisi terkini wilayah Indonesia berdasarkan data resmi."
		/>
		<ErrorPanel message={loadError} retry={() => refresh()} />
	</div>
{:else if dashboard}
	<div class="space-y-5">
		<!-- Active warning banner: the single most important thing on the page. -->
		{#if warningCount > 0}
			<a
				href={resolve('/warnings')}
				class="block rounded-xl border border-red-300 bg-red-50 px-4 py-3 transition hover:border-red-400 dark:border-red-500/40 dark:bg-red-950/50"
			>
				<div class="flex items-center gap-3">
					<TriangleAlert
						size={20}
						class="shrink-0 text-red-600 dark:text-red-400"
						aria-hidden="true"
					/>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-bold text-red-900 dark:text-red-100">
							{warningCount} peringatan dini cuaca aktif
						</p>
						<p class="truncate text-xs text-red-800 dark:text-red-200">
							{dashboard.activeWarnings[0]?.title ?? ''}
						</p>
					</div>
					<ArrowRight
						size={16}
						class="shrink-0 text-red-600 dark:text-red-400"
						aria-hidden="true"
					/>
				</div>
			</a>
		{:else}
			<InlineNotice tone="success">
				Tidak ada peringatan dini cuaca aktif dari BMKG saat ini.
			</InlineNotice>
		{/if}

		{#if dashboard.partial}
			<InlineNotice tone="warning" title="Sebagian data tidak tersedia">
				{#each dashboard.warnings as warning (warning)}
					<div>{warning}</div>
				{/each}
			</InlineNotice>
		{/if}

		<PageHeader
			title="Ringkasan Hari Ini"
			subtitle="Kondisi terkini berdasarkan data resmi BMKG, PVMBG/MAGMA, dan BNPB."
		>
			{#snippet actions()}
				<button
					type="button"
					onclick={() => refresh()}
					disabled={refreshing}
					class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--border-strong)] disabled:opacity-60"
				>
					<RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
					Perbarui
				</button>
			{/snippet}
		</PageHeader>

		<!-- Summary cards -->
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<StatCard
				label="Peringatan Dini Aktif"
				value={warningCount}
				tone={warningCount > 0 ? 'danger' : 'neutral'}
				hint="BMKG CAP"
				href="/warnings"
			>
				{#snippet icon()}<TriangleAlert size={16} />{/snippet}
			</StatCard>
			<StatCard
				label="Gempa Terbaru"
				value={quakeCount}
				tone="neutral"
				hint="BMKG — gempa yang sudah terjadi"
				href="/earthquakes"
			>
				{#snippet icon()}<Activity size={16} />{/snippet}
			</StatCard>
			<StatCard
				label="Gunung Api Di Atas Normal"
				value={volcanoCount}
				tone={volcanoCount > 0 ? 'warning' : 'neutral'}
				hint="Level II–IV · PVMBG"
				href="/volcanoes"
			>
				{#snippet icon()}<Flame size={16} />{/snippet}
			</StatCard>
			<StatCard
				label="Skor Risiko Internal"
				value={dashboard.risk.score}
				unit="/ 100"
				tone={dashboard.risk.score >= 51
					? 'danger'
					: dashboard.risk.score >= 26
						? 'warning'
						: 'neutral'}
				hint="Bukan peringatan resmi"
			/>
			{#if dashboard.humidity?.nationalAverage != null}
				<StatCard
					label="Kelembapan Nasional"
					value={Math.round(dashboard.humidity.nationalAverage)}
					unit="%"
					tone="neutral"
					hint="Rata-rata ibu kota provinsi · BMKG"
				>
					{#snippet icon()}<Droplets size={16} />{/snippet}
				</StatCard>
			{/if}
		</div>

		<!-- National humidity snapshot -->
		{#if dashboard.humidity}
			<section aria-labelledby="humidity-heading" class="card p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 id="humidity-heading" class="flex items-center gap-1.5 text-sm font-semibold">
						<Droplets size={15} class="text-sky-500" aria-hidden="true" />
						Kelembapan Udara per Provinsi
					</h2>
					{#if dashboard.humidity.nationalAverage != null}
						<HumidityBadge humidity={dashboard.humidity.nationalAverage} size="md" />
					{/if}
				</div>

				{#if dashboard.humidity.provinces.length > 0}
					<p class="text-subtle mt-1.5 text-[11px]">
						Prakiraan BMKG per ibu kota provinsi ({dashboard.humidity.sampledCount}/{dashboard
							.humidity.totalCount}
						terjangkau){#if dashboard.humidity.nationalAverage != null}, rata-rata nasional <span
								class="font-medium tabular-nums"
								>{formatHumidity(dashboard.humidity.nationalAverage)}</span
							>{/if}{#if dashboard.humidity.min != null && dashboard.humidity.max != null}, rentang <span
								class="tabular-nums"
								>{formatHumidity(dashboard.humidity.min)}–{formatHumidity(
									dashboard.humidity.max
								)}</span
							>{/if}. Klasifikasi internal, bukan produk resmi BMKG.
					</p>

					<!-- Band distribution -->
					<div class="mt-3 flex flex-wrap gap-2">
						{#each HUMIDITY_BANDS as band (band.level)}
							{#if (dashboard.humidity.bandCounts[band.level] ?? 0) > 0}
								<span
									class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold {band.badgeClass}"
								>
									{band.label}
									<span class="tabular-nums opacity-80"
										>{dashboard.humidity.bandCounts[band.level]}</span
									>
								</span>
							{/if}
						{/each}
					</div>

					<!-- Per-province list, driest first -->
					<div class="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
						{#each [...dashboard.humidity.provinces].sort((a, b) => a.humidity - b.humidity) as province (province.code)}
							<a
								href={resolve('/location/[regionCode]', { regionCode: province.code })}
								class="surface-subtle flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:border-[var(--border-strong)]"
							>
								<span class="min-w-0 truncate font-medium">{province.name}</span>
								<HumidityBadge humidity={province.humidity} showLabel={false} size="sm" />
							</a>
						{/each}
					</div>

					{#if dashboard.humidity.partial}
						<p class="text-subtle mt-2 text-[10px]">
							Sebagian wilayah tidak mengembalikan data kelembapan dan tidak dihitung.
						</p>
					{/if}
				{:else}
					<InlineNotice tone="neutral">
						Data kelembapan wilayah tidak dapat dimuat saat ini.
					</InlineNotice>
				{/if}
			</section>
		{/if}

		<!-- Map + risk -->
		<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
			<section aria-labelledby="map-heading" class="space-y-2">
				<div class="flex items-center justify-between">
					<h2 id="map-heading" class="text-sm font-semibold">Peta Sebaran Peristiwa</h2>
					<a
						href={resolve('/map')}
						class="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
					>
						Buka peta penuh <ArrowRight size={12} aria-hidden="true" />
					</a>
				</div>
				<MapView events={mapEvents} height="380px" syncUrl={false} />
				<DataStatusBar
					source="BMKG, PVMBG/MAGMA"
					updatedAt={dashboard.updatedAt}
					cached
					partial={dashboard.partial}
					notes={dashboard.warnings}
				/>
			</section>

			<section aria-labelledby="risk-heading" class="space-y-2">
				<h2 id="risk-heading" class="sr-only">Skor risiko internal</h2>
				<RiskBadge assessment={dashboard.risk} showFactors />
			</section>
		</div>

		<!-- Warnings + earthquakes -->
		<div class="grid gap-4 lg:grid-cols-2">
			<section class="space-y-2" aria-labelledby="warn-heading">
				<div class="flex items-center justify-between">
					<h2 id="warn-heading" class="flex items-center gap-1.5 text-sm font-semibold">
						<TriangleAlert size={15} class="text-red-600 dark:text-red-400" aria-hidden="true" />
						Peringatan Dini Terkini
					</h2>
					<a
						href={resolve('/warnings')}
						class="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400">Semua →</a
					>
				</div>
				<div class="space-y-2">
					{#each dashboard.activeWarnings.slice(0, 4) as event (event.id)}
						<EventCard {event} compact />
					{:else}
						<InlineNotice tone="neutral">Tidak ada peringatan dini aktif.</InlineNotice>
					{/each}
				</div>
			</section>

			<section class="space-y-2" aria-labelledby="quake-heading">
				<div class="flex items-center justify-between">
					<h2 id="quake-heading" class="flex items-center gap-1.5 text-sm font-semibold">
						<Activity size={15} class="text-sky-600 dark:text-sky-400" aria-hidden="true" />
						Gempa Terbaru
					</h2>
					<a
						href={resolve('/earthquakes')}
						class="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400">Semua →</a
					>
				</div>
				<div class="space-y-2">
					{#each dashboard.recentEarthquakes.slice(0, 4) as event (event.id)}
						<EventCard {event} compact />
					{:else}
						<InlineNotice tone="neutral">Data gempa belum tersedia.</InlineNotice>
					{/each}
				</div>
			</section>
		</div>

		<!-- Volcano status -->
		<section class="space-y-2" aria-labelledby="volcano-heading">
			<div class="flex items-center justify-between">
				<h2 id="volcano-heading" class="flex items-center gap-1.5 text-sm font-semibold">
					<Flame size={15} class="text-orange-600 dark:text-orange-400" aria-hidden="true" />
					Status Gunung Api (Level di Atas Normal)
				</h2>
				<a
					href={resolve('/volcanoes')}
					class="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400">Semua →</a
				>
			</div>

			{#if Object.keys(dashboard.volcanoLevels).length > 0}
				<div class="flex flex-wrap gap-2">
					{#each Object.entries(dashboard.volcanoLevels) as [level, count] (level)}
						<span class="card inline-flex items-center gap-2 px-3 py-1.5 text-xs">
							<span class="font-semibold">Level {level}</span>
							<span class="text-subtle">·</span>
							<span class="tabular-nums">{count} gunung</span>
						</span>
					{/each}
				</div>
			{/if}

			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each dashboard.activeVolcanoes.slice(0, 6) as event (event.id)}
					<EventCard {event} compact />
				{:else}
					<InlineNotice tone="neutral">Data aktivitas gunung api belum tersedia.</InlineNotice>
				{/each}
			</div>
		</section>

		<!-- Type breakdown -->
		<section class="space-y-2" aria-labelledby="types-heading">
			<h2 id="types-heading" class="text-sm font-semibold">Sebaran Jenis Data</h2>
			<div class="flex flex-wrap gap-2">
				{#each Object.entries(dashboard.countsByType).sort((a, b) => b[1] - a[1]) as [type, count] (type)}
					<span class="card inline-flex items-center gap-1.5 px-2.5 py-1 text-xs">
						<TypeIcon type={type as never} size={13} />
						<span class="font-medium">{type}</span>
						<span class="text-subtle tabular-nums">{count}</span>
					</span>
				{/each}
			</div>
		</section>

		<!-- Global sources note -->
		<section class="card p-4">
			<h2 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
				<Waves size={15} aria-hidden="true" /> Sumber &amp; Keterbatasan Data
			</h2>
			<ul class="text-subtle space-y-1.5 text-xs">
				<li class="flex items-start gap-1.5">
					<CloudLightning size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
					<span>
						<strong class="text-muted">Cuaca &amp; peringatan dini:</strong> BMKG. Peringatan yang sudah
						berakhir tidak ditampilkan sebagai peringatan aktif.
					</span>
				</li>
				<li class="flex items-start gap-1.5">
					<Activity size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
					<span>
						<strong class="text-muted">Gempa bumi:</strong> BMKG. Aplikasi ini menampilkan gempa
						yang
						<em>sudah terjadi</em> dan tidak memprediksi gempa.
					</span>
				</li>
				<li class="flex items-start gap-1.5">
					<Flame size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
					<span>
						<strong class="text-muted">Gunung api:</strong> PVMBG/MAGMA. Tingkat aktivitas adalah status
						resmi yang dipublikasikan.
					</span>
				</li>
			</ul>
			<div class="mt-3">
				<a
					href={resolve('/sources')}
					class="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
				>
					Lihat semua sumber data dan atribusi →
				</a>
			</div>
		</section>

		<div class="flex flex-wrap items-center justify-between gap-2">
			<DataStatusBar
				source="BMKG, PVMBG/MAGMA"
				updatedAt={dashboard.updatedAt}
				retrievedAt={updatedAt}
				cached
				partial={dashboard.partial}
			/>
			<p class="text-subtle text-[11px]">Diperbarui {formatRelative(updatedAt)}</p>
		</div>
	</div>
{/if}
