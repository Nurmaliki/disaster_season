<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Search, LoaderCircle, X, MapPin, Activity, TriangleAlert, Flame } from 'lucide-svelte';
	import { apiGet, errorMessage } from '$lib/api/client';
	import type { SearchPayload, SearchResult, SearchResultKind } from '$lib/api/types';

	/**
	 * Global search.
	 *
	 * Searches regions AND current events (earthquakes, warnings, volcanoes) via
	 * /api/search, so typing "bandung", "gempa" or "merapi" all work. Results are
	 * grouped by kind and flattened into one keyboard-navigable list.
	 *
	 * Debounced, abortable, and fully keyboard accessible (arrows / Enter / Esc).
	 */
	interface Props {
		/** Called with the chosen result before navigation. */
		onSelect?: (result: SearchResult) => void;
		/** Navigate on selection (default true). */
		navigate?: boolean;
	}

	let { onSelect, navigate = true }: Props = $props();

	let query = $state('');
	let payload = $state<SearchPayload>({ regions: [], events: [], eventsSearched: false });
	let loading = $state(false);
	let error = $state<string | null>(null);
	let open = $state(false);
	let highlighted = $state(-1);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let requestController: AbortController | null = null;

	/** Flattened, ordered list backing keyboard navigation. */
	const flat = $derived([...payload.regions, ...payload.events]);

	const hasResults = $derived(flat.length > 0);

	function onInput(value: string): void {
		query = value;
		error = null;

		if (debounceTimer) clearTimeout(debounceTimer);

		if (value.trim().length < 2) {
			payload = { regions: [], events: [], eventsSearched: false };
			open = false;
			loading = false;
			return;
		}

		loading = true;
		open = true;
		debounceTimer = setTimeout(() => void search(value), 250);
	}

	async function search(value: string): Promise<void> {
		requestController?.abort();
		requestController = new AbortController();

		try {
			const response = await apiGet<SearchPayload>(
				'/api/search',
				{ q: value },
				{ signal: requestController.signal, timeoutMs: 8000 }
			);
			// Ignore out-of-date responses (the user has typed on).
			if (value !== query) return;
			payload = response.data;
			highlighted = payload.regions.length + payload.events.length > 0 ? 0 : -1;
			open = true;
		} catch (err) {
			if ((err as Error).name === 'AbortError') return;
			error = errorMessage(err);
			payload = { regions: [], events: [], eventsSearched: false };
		} finally {
			loading = false;
		}
	}

	function choose(result: SearchResult): void {
		open = false;
		query = result.title;
		onSelect?.(result);
		if (navigate) {
			// Resolve inline using route IDs: this keeps `resolve()` both
			// type-correct and visible to the no-navigation-without-resolve rule.
			void goto(
				result.kind === 'region'
					? resolve('/location/[regionCode]', { regionCode: result.id })
					: resolve('/event/[id]', { id: result.id })
			);
		}
	}

	function onKeydown(event: KeyboardEvent): void {
		if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
			open = hasResults;
			return;
		}
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				highlighted = Math.min(highlighted + 1, flat.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				highlighted = Math.max(highlighted - 1, 0);
				break;
			case 'Enter':
				if (highlighted >= 0 && flat[highlighted]) {
					event.preventDefault();
					choose(flat[highlighted]);
				}
				break;
			case 'Escape':
				open = false;
				highlighted = -1;
				break;
		}
	}

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
		requestController?.abort();
	});

	const KIND_ICONS: Record<SearchResultKind, typeof MapPin> = {
		region: MapPin,
		earthquake: Activity,
		warning: TriangleAlert,
		volcano: Flame
	};

	/** Region group starts at index 0; events follow. Used for highlight math. */
	const regionCount = $derived(payload.regions.length);
</script>

<div class="relative">
	<div class="relative">
		<Search
			size={15}
			class="text-subtle pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
			aria-hidden="true"
		/>
		<input
			type="search"
			value={query}
			oninput={(event) => onInput((event.currentTarget as HTMLInputElement).value)}
			onkeydown={onKeydown}
			onfocus={() => (open = hasResults)}
			onblur={() => setTimeout(() => (open = false), 150)}
			placeholder="Cari wilayah, gempa, gunung api…"
			class="surface-subtle w-full rounded-md border border-[var(--border)] py-1.5 pr-8 pl-8 text-sm transition outline-none focus:border-sky-500"
			aria-label="Cari wilayah atau kejadian bencana"
			role="combobox"
			aria-expanded={open}
			aria-controls="search-results"
			aria-autocomplete="list"
			autocomplete="off"
		/>
		{#if loading}
			<LoaderCircle
				size={14}
				class="text-subtle absolute top-1/2 right-2.5 -translate-y-1/2 animate-spin"
				aria-hidden="true"
			/>
		{:else if query}
			<button
				type="button"
				class="text-subtle hover:text-muted absolute top-1/2 right-2.5 -translate-y-1/2"
				onclick={() => {
					query = '';
					payload = { regions: [], events: [], eventsSearched: false };
					open = false;
				}}
				aria-label="Bersihkan pencarian"
			>
				<X size={14} />
			</button>
		{/if}
	</div>

	{#if open && (hasResults || error || payload.eventsSearched === false)}
		<div
			id="search-results"
			class="surface-elevated scroll-thin absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-[var(--border)] py-1 shadow-lg"
			role="listbox"
		>
			{#if error}
				<p class="px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{error}</p>
			{/if}

			{#if payload.regions.length > 0}
				<p class="text-subtle px-3 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide uppercase">
					Wilayah
				</p>
				{#each payload.regions as result, index (result.id)}
					{@render option(result, index)}
				{/each}
			{/if}

			{#if payload.events.length > 0}
				<p class="text-subtle px-3 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide uppercase">
					Kejadian
				</p>
				{#each payload.events as result, index (result.id)}
					{@render option(result, regionCount + index)}
				{/each}
			{/if}

			{#if !hasResults && !error}
				<p class="text-subtle px-3 py-2 text-xs">
					{#if payload.eventsSearched === false}
						Tidak ada wilayah yang cocok. Data kejadian sedang tidak dapat diakses.
					{:else}
						Tidak ada hasil yang cocok.
					{/if}
				</p>
			{/if}
		</div>
	{/if}
</div>

{#snippet option(result: SearchResult, index: number)}
	{@const Icon = KIND_ICONS[result.kind]}
	<button
		type="button"
		role="option"
		aria-selected={index === highlighted}
		class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition {index ===
		highlighted
			? 'surface-subtle'
			: ''}"
		onmousedown={(event) => {
			event.preventDefault();
			choose(result);
		}}
		onmouseenter={() => (highlighted = index)}
	>
		<Icon size={14} class="text-subtle shrink-0" aria-hidden="true" />
		<span class="min-w-0 flex-1">
			<span class="block truncate">{result.title}</span>
			<span class="text-subtle block truncate text-[10px]">{result.subtitle}</span>
		</span>
	</button>
{/snippet}
