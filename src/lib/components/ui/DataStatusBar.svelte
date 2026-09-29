<script lang="ts">
	import { formatDateTime, formatRelative } from '$lib/utils/format';

	/**
	 * Provenance footer.
	 *
	 * Every data panel renders this so the user can always see:
	 *   - which source the data came from,
	 *   - when it was last updated upstream,
	 *   - when we last fetched it,
	 *   - and its freshness status (live / cached / stale / partial).
	 *
	 * This is a safety requirement, not decoration.
	 */
	interface Props {
		source: string;
		/** Upstream update time. */
		updatedAt?: string | null;
		retrievedAt?: string | null;
		cached?: boolean;
		stale?: boolean;
		partial?: boolean;
		/** Extra non-fatal issues to surface. */
		notes?: string[];
		class?: string;
	}

	let {
		source,
		updatedAt = null,
		retrievedAt = null,
		cached = false,
		stale = false,
		partial = false,
		notes = [],
		class: className = ''
	}: Props = $props();

	const status = $derived(
		stale
			? { label: 'Data lama (cache)', tone: 'warning' as const }
			: partial
				? { label: 'Data sebagian', tone: 'warning' as const }
				: cached
					? { label: 'Dari cache', tone: 'info' as const }
					: { label: 'Terkini', tone: 'ok' as const }
	);

	const TONES = {
		ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
		info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
		warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
	};
</script>

<div
	class="text-subtle flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] {className}"
	aria-label="Informasi sumber dan waktu data"
>
	<span class="inline-flex items-center gap-1">
		<span class="text-muted font-semibold">Sumber:</span>
		<span>{source}</span>
	</span>

	<span class="rounded px-1.5 py-0.5 font-semibold {TONES[status.tone]}">{status.label}</span>

	{#if updatedAt}
		<span title={formatDateTime(updatedAt)}>
			<span class="text-muted font-semibold">Diperbarui:</span>
			{formatRelative(updatedAt)} ({formatDateTime(updatedAt)})
		</span>
	{/if}

	{#if retrievedAt && retrievedAt !== updatedAt}
		<span title={formatDateTime(retrievedAt)}>
			<span class="text-muted font-semibold">Diambil:</span>
			{formatRelative(retrievedAt)}
		</span>
	{/if}

	{#each notes as note (note)}
		<span class="text-amber-700 dark:text-amber-400">⚠ {note}</span>
	{/each}
</div>
