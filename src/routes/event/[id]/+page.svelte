<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import EventCard from '$lib/components/EventCard.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import SeverityChip from '$lib/components/ui/SeverityChip.svelte';
	import CategoryChip from '$lib/components/ui/CategoryChip.svelte';
	import TypeIcon from '$lib/components/ui/TypeIcon.svelte';
	import MapView from '$lib/components/map/MapView.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import { formatDateTime, formatRelative, formatMagnitude, formatDepth } from '$lib/utils/format';
	import { disasterTypeToken } from '$lib/utils/severity';
	import { RISK_DISCLAIMER } from '$lib/utils/risk';
	import { ArrowLeft, ExternalLink, MapPin, Clock, ShieldAlert, Layers } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const event = $derived(data.event);
	const related = $derived(data.related);
	const typeToken = $derived(disasterTypeToken(event.type));

	const occurred = $derived(event.occurredAt ?? event.validFrom ?? null);

	const magnitude = $derived(
		event.type === 'earthquake' && Number.isFinite(Number(event.metadata?.magnitude))
			? formatMagnitude(Number(event.metadata?.magnitude))
			: null
	);
	const depth = $derived(
		event.type === 'earthquake' && Number.isFinite(Number(event.metadata?.depthKm))
			? formatDepth(Number(event.metadata?.depthKm))
			: null
	);

	const place = $derived(
		[
			event.location.village,
			event.location.district,
			event.location.regency,
			event.location.province
		]
			.filter(Boolean)
			.join(', ') ||
			(event.metadata?.region as string | undefined) ||
			null
	);

	// Coordinates are only shown when they are real (never the 0,0 placeholder).
	const hasCoords = $derived(
		Number.isFinite(event.location.latitude) &&
			Number.isFinite(event.location.longitude) &&
			!(event.location.latitude === 0 && event.location.longitude === 0)
	);
</script>

<svelte:head>
	<title>{event.title} — Disaster Monitor</title>
	<meta name="description" content={event.description ?? event.title} />
</svelte:head>

<div class="mx-auto max-w-4xl space-y-4">
	<a
		href={resolve('/map')}
		class="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
	>
		<ArrowLeft size={13} aria-hidden="true" /> Kembali ke peta
	</a>

	<article class="card p-4">
		{#if data.fromHistory}
			<div class="mb-3">
				<InlineNotice tone="neutral">
					Peristiwa ini diambil dari riwayat tersimpan dan mungkin sudah tidak ditampilkan pada
					umpan terkini sumber resmi.
				</InlineNotice>
			</div>
		{/if}

		<div class="flex flex-wrap items-center gap-2">
			<CategoryChip category={event.category} size="md" />
			<SeverityChip severity={event.severity} internal={event.severityIsInternal} size="md" full />
			<span class="text-subtle inline-flex items-center gap-1 text-xs">
				<TypeIcon type={event.type} size={13} />
				{typeToken.label}
			</span>
		</div>

		<h1 class="mt-2 text-lg leading-snug font-bold sm:text-xl">{event.title}</h1>

		{#if event.description}
			<p class="text-muted mt-2 text-sm leading-relaxed">{event.description}</p>
		{/if}

		<dl class="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
			{#if magnitude}
				<div class="flex gap-2">
					<dt class="text-subtle w-28 shrink-0 font-semibold">Magnitudo</dt>
					<dd class="font-semibold">{magnitude}</dd>
				</div>
			{/if}
			{#if depth}
				<div class="flex gap-2">
					<dt class="text-subtle w-28 shrink-0 font-semibold">Kedalaman</dt>
					<dd>{depth}</dd>
				</div>
			{/if}
			{#if event.type === 'volcano' && event.metadata?.level}
				<div class="flex gap-2">
					<dt class="text-subtle w-28 shrink-0 font-semibold">Tingkat Aktivitas</dt>
					<dd class="font-semibold">Level {event.metadata.level}</dd>
				</div>
			{/if}

			<div class="flex gap-2">
				<dt class="text-subtle flex w-28 shrink-0 items-center gap-1 font-semibold">
					<Clock size={11} aria-hidden="true" /> Waktu kejadian
				</dt>
				<dd>
					{#if occurred}
						{formatDateTime(occurred)}
						<span class="text-subtle">· {formatRelative(occurred)}</span>
					{:else}
						<span class="text-subtle">Tidak dicantumkan oleh sumber</span>
					{/if}
				</dd>
			</div>

			{#if event.validFrom || event.validUntil}
				<div class="flex gap-2">
					<dt class="text-subtle w-28 shrink-0 font-semibold">Berlaku</dt>
					<dd>
						{#if event.validFrom}{formatDateTime(event.validFrom)}{/if}
						{#if event.validUntil}
							→ {formatDateTime(event.validUntil)}{/if}
					</dd>
				</div>
			{/if}

			{#if place}
				<div class="flex gap-2">
					<dt class="text-subtle flex w-28 shrink-0 items-center gap-1 font-semibold">
						<MapPin size={11} aria-hidden="true" /> Wilayah
					</dt>
					<dd>{place}</dd>
				</div>
			{/if}

			<div class="flex gap-2">
				<dt class="text-subtle flex w-28 shrink-0 items-center gap-1 font-semibold">
					<Layers size={11} aria-hidden="true" /> Sumber
				</dt>
				<dd>
					<span>{event.source.name}</span>
					{#if event.source.url}
						<a
							href={event.source.url}
							target="_blank"
							rel="external noopener noreferrer"
							class="ml-1 inline-flex items-center gap-0.5 text-sky-600 hover:underline dark:text-sky-400"
						>
							tautan <ExternalLink size={10} aria-hidden="true" />
						</a>
					{/if}
				</dd>
			</div>
		</dl>

		<div class="mt-4 border-t border-[var(--border)] pt-2">
			<DataStatusBar
				source={event.source.name}
				updatedAt={event.updatedAt}
				retrievedAt={event.retrievedAt}
				cached
				notes={event.severityIsInternal
					? ['Tingkat keparahan dihitung aplikasi, bukan klasifikasi resmi.']
					: []}
			/>
		</div>
	</article>

	{#if hasCoords}
		<section aria-labelledby="loc-heading" class="space-y-2">
			<h2 id="loc-heading" class="text-sm font-semibold">Lokasi</h2>
			<div class="overflow-hidden rounded-xl border border-[var(--border)]">
				<MapView events={[event]} height="300px" syncUrl={false} showControls={false} />
			</div>
		</section>
	{/if}

	<section class="card p-4">
		<h2 class="mb-1 flex items-center gap-1.5 text-sm font-semibold">
			<ShieldAlert size={15} aria-hidden="true" /> Indikator Risiko Internal
		</h2>
		<p class="text-subtle text-xs">
			Skor indikator aplikasi untuk peristiwa ini:
			<span class="text-muted font-semibold tabular-nums">{data.internalRisk}/100</span>
		</p>
		<p class="text-subtle mt-1 text-[11px]">{RISK_DISCLAIMER}</p>
	</section>

	{#if related.length > 0}
		<section aria-labelledby="related-heading" class="space-y-2">
			<h2 id="related-heading" class="text-sm font-semibold">
				Peristiwa {typeToken.label} Lainnya
			</h2>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each related as item (item.id)}
					<EventCard event={item} compact />
				{/each}
			</div>
		</section>
	{/if}

	<InlineNotice tone="neutral">
		Informasi ini berasal dari sumber resmi dan ditampilkan apa adanya. Untuk keputusan keselamatan,
		selalu rujuk ke informasi resmi BMKG, BNPB, BPBD, dan PVMBG.
	</InlineNotice>
</div>
