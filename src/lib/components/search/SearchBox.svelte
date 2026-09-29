<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Search, LoaderCircle, X } from 'lucide-svelte';
	import { apiGet, errorMessage } from '$lib/api/client';
	import type { Region } from '$lib/types';

	/**
	 * Region search.
	 *
	 * Queries our own /api/regions endpoint (backed by the bundled BPS/BIG code
	 * table) with debouncing, so typing does not hammer the server. Full keyboard
	 * support: arrow keys move the highlight, Enter selects, Escape clears.
	 */
	interface Props {
		onSelect?: (region: Region) => void;
		/** Navigate to the location page on selection (default true). */
		navigate?: boolean;
	}

	let { onSelect, navigate = true }: Props = $props();

	let query = $state('');
	let results = $state<Region[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let open = $state(false);
	let highlighted = $state(-1);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let requestController: AbortController | null = null;

	function onInput(value: string): void {
		query = value;
		error = null;

		if (debounceTimer) clearTimeout(debounceTimer);

		if (value.trim().length < 2) {
			results = [];
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
			const response = await apiGet<Region[]>(
				'/api/regions',
				{ q: value },
				{
					signal: requestController.signal,
					timeoutMs: 8000
				}
			);
			// Ignore out-of-date responses.
			if (value !== query) return;
			results = response.data;
			highlighted = results.length ? 0 : -1;
			open = true;
		} catch (err) {
			if ((err as Error).name === 'AbortError') return;
			error = errorMessage(err);
			results = [];
		} finally {
			loading = false;
		}
	}

	function choose(region: Region): void {
		open = false;
		query = region.name;
		onSelect?.(region);
		if (navigate)
			void goto(resolve('/location/[regionCode]', { regionCode: encodeURIComponent(region.code) }));
	}

	function onKeydown(event: KeyboardEvent): void {
		if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
			open = results.length > 0;
			return;
		}
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				highlighted = Math.min(highlighted + 1, results.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				highlighted = Math.max(highlighted - 1, 0);
				break;
			case 'Enter':
				if (highlighted >= 0 && results[highlighted]) {
					event.preventDefault();
					choose(results[highlighted]);
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

	const LEVEL_LABELS: Record<Region['level'], string> = {
		country: 'Negara',
		province: 'Provinsi',
		regency: 'Kabupaten/Kota',
		district: 'Kecamatan',
		village: 'Desa/Kelurahan'
	};
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
			onfocus={() => (open = results.length > 0)}
			onblur={() => setTimeout(() => (open = false), 150)}
			placeholder="Cari provinsi, kabupaten, kota…"
			class="surface-subtle w-full rounded-md border border-[var(--border)] py-1.5 pr-8 pl-8 text-sm transition outline-none focus:border-sky-500"
			aria-label="Cari wilayah Indonesia"
			role="combobox"
			aria-expanded={open}
			aria-controls="region-search-results"
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
					results = [];
					open = false;
				}}
				aria-label="Bersihkan pencarian"
			>
				<X size={14} />
			</button>
		{/if}
	</div>

	{#if open && (results.length > 0 || error)}
		<ul
			id="region-search-results"
			class="surface-elevated scroll-thin absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-[var(--border)] py-1 shadow-lg"
			role="listbox"
		>
			{#if error}
				<li class="px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{error}</li>
			{/if}
			{#each results as region, index (region.code)}
				<li role="option" aria-selected={index === highlighted}>
					<button
						type="button"
						class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition {index ===
						highlighted
							? 'surface-subtle'
							: ''}"
						onmousedown={(event) => {
							event.preventDefault();
							choose(region);
						}}
						onmouseenter={() => (highlighted = index)}
					>
						<span class="truncate">{region.name}</span>
						<span class="text-subtle shrink-0 text-[10px]">{LEVEL_LABELS[region.level]}</span>
					</button>
				</li>
			{/each}
			{#if results.length === 0 && !error}
				<li class="text-subtle px-3 py-2 text-xs">Tidak ada wilayah yang cocok.</li>
			{/if}
		</ul>
	{/if}
</div>
