<script lang="ts">
	import type { PageData } from './$types';
	import type { DashboardPayload } from '$lib/api/types';
	import MapView from '$lib/components/map/MapView.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import ErrorPanel from '$lib/components/ui/ErrorPanel.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import { DISASTER_TYPE_TOKENS } from '$lib/utils/severity';
	import { X } from 'lucide-svelte';
	import type { DisasterType } from '$lib/types';

	let { data }: { data: PageData } = $props();

	const dashboard = $derived(data.dashboard as DashboardPayload | null);
	const loadError = $derived(data.loadError as string | null);

	let selectedType = $state<DisasterType | 'all'>('all');
	let selectedId = $state<string | null>(null);

	const allEvents = $derived(dashboard?.topEvents ?? []);

	const filtered = $derived(
		selectedType === 'all' ? allEvents : allEvents.filter((event) => event.type === selectedType)
	);

	const availableTypes = $derived(
		[...new Set(allEvents.map((e) => e.type))].sort((a, b) =>
			(DISASTER_TYPE_TOKENS[a]?.label ?? a).localeCompare(DISASTER_TYPE_TOKENS[b]?.label ?? b, 'id')
		)
	);

	const selectedEvent = $derived(allEvents.find((event) => event.id === selectedId) ?? null);
</script>

<svelte:head>
	<title>Peta Bencana &amp; Cuaca Indonesia — Disaster Monitor</title>
	<meta
		name="description"
		content="Peta interaktif sebaran gempa, peringatan dini cuaca, dan aktivitas gunung api Indonesia dari sumber resmi."
	/>
</svelte:head>

<div class="flex min-h-full flex-col">
	{#if loadError && !dashboard}
		<div class="mx-auto w-full max-w-3xl px-4 py-6">
			<ErrorPanel message={loadError} />
		</div>
	{:else}
		<!-- Filter bar -->
		<div class="surface-elevated border-b border-[var(--border)] px-3 py-2">
			<div class="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2">
				<span class="text-muted text-xs font-semibold">Jenis:</span>
				<button
					type="button"
					onclick={() => (selectedType = 'all')}
					class="rounded-full border px-2.5 py-1 text-[11px] font-medium transition {selectedType ===
					'all'
						? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
						: 'text-muted border-[var(--border)] hover:border-[var(--border-strong)]'}"
				>
					Semua ({allEvents.length})
				</button>
				{#each availableTypes as type (type)}
					{@const count = allEvents.filter((e) => e.type === type).length}
					<button
						type="button"
						onclick={() => (selectedType = type)}
						class="rounded-full border px-2.5 py-1 text-[11px] font-medium transition {selectedType ===
						type
							? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
							: 'text-muted border-[var(--border)] hover:border-[var(--border-strong)]'}"
					>
						{DISASTER_TYPE_TOKENS[type]?.label ?? type} ({count})
					</button>
				{/each}
			</div>
		</div>

		<!-- Map + side list -->
		<div class="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
			<div class="flex p-2 lg:min-h-0 lg:flex-1 lg:flex-col">
				<div class="h-[70vh] w-full lg:h-full">
					<MapView
						events={filtered}
						height="100%"
						initialZoom={4.2}
						onSelect={(event) => (selectedId = event?.id ?? null)}
					/>
				</div>
			</div>

			<aside
				class="w-full shrink-0 border-t border-[var(--border)] p-3 lg:w-96 lg:border-t-0 lg:border-l"
				aria-label="Daftar peristiwa"
			>
				<div class="mb-2 flex items-center justify-between">
					<h2 class="text-sm font-semibold">{filtered.length} peristiwa</h2>
					{#if selectedEvent}
						<button
							type="button"
							onclick={() => (selectedId = null)}
							class="text-subtle hover:text-muted inline-flex items-center gap-1 text-[11px]"
						>
							<X size={12} /> Tutup
						</button>
					{/if}
				</div>

				<div
					class="scroll-thin max-h-[70vh] space-y-2 overflow-y-auto lg:max-h-[calc(100vh-13rem)]"
				>
					{#each filtered as event (event.id)}
						<EventCard {event} compact />
					{:else}
						<InlineNotice tone="neutral">
							Tidak ada peristiwa untuk filter ini. Coba pilih jenis lain atau periksa kembali
							nanti.
						</InlineNotice>
					{/each}
				</div>

				{#if dashboard}
					<div class="mt-3 border-t border-[var(--border)] pt-2">
						<DataStatusBar
							source="BMKG, PVMBG/MAGMA"
							updatedAt={dashboard.updatedAt}
							cached
							partial={dashboard.partial}
							notes={dashboard.warnings}
						/>
					</div>
				{/if}
			</aside>
		</div>
	{/if}
</div>
