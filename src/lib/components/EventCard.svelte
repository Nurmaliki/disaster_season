<script lang="ts">
	import { resolve } from '$app/paths';
	import type { DisasterEvent } from '$lib/types';
	import { formatRelative, formatDateTime, formatMagnitude, formatDepth } from '$lib/utils/format';
	import { disasterTypeToken } from '$lib/utils/severity';
	import TypeIcon from './ui/TypeIcon.svelte';
	import SeverityChip from './ui/SeverityChip.svelte';
	import CategoryChip from './ui/CategoryChip.svelte';

	interface Props {
		event: DisasterEvent;
		/** Compact variant for dense side panels. */
		compact?: boolean;
	}

	let { event, compact = false }: Props = $props();

	const typeToken = $derived(disasterTypeToken(event.type));

	// Earthquake-specific facts, shown only when actually present.
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
	const tsunami = $derived(event.metadata?.tsunamiPotential === true);

	const place = $derived(
		event.location.village ??
			event.location.district ??
			event.location.regency ??
			event.location.province ??
			(event.metadata?.region as string | undefined) ??
			null
	);

	const when = $derived(event.occurredAt ?? event.validFrom ?? event.updatedAt);
</script>

<a
	href={resolve('/event/[id]', { id: encodeURIComponent(event.id) })}
	class="card block px-3 py-2.5 transition hover:border-[var(--border-strong)] hover:shadow-sm"
>
	<div class="flex items-start gap-2.5">
		<span
			class="surface-subtle mt-0.5 shrink-0 rounded-md border border-[var(--border)] p-1.5"
			aria-hidden="true"
		>
			<TypeIcon type={event.type} size={16} />
		</span>

		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5">
				<CategoryChip category={event.category} />
				<SeverityChip severity={event.severity} internal={event.severityIsInternal} />
				{#if tsunami}
					<span
						class="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300"
						title="BMKG mencatat potensi tsunami pada gempa ini">POTENSI TSUNAMI</span
					>
				{/if}
			</div>

			<h3 class="mt-1 line-clamp-2 text-sm leading-snug font-semibold">{event.title}</h3>

			<div class="text-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
				<span class="text-muted inline-flex items-center gap-1 font-medium">
					<TypeIcon type={event.type} size={11} />
					{typeToken.label}
				</span>
				{#if magnitude}<span class="text-muted font-semibold">{magnitude}</span>{/if}
				{#if depth}<span>{depth}</span>{/if}
				{#if place}
					<span class="inline-flex items-center gap-1 truncate">📍 {place}</span>
				{/if}
				<span title={formatDateTime(when)}>{formatRelative(when)}</span>
			</div>

			{#if !compact && event.description}
				<p class="text-subtle mt-1 line-clamp-2 text-[11px]">{event.description}</p>
			{/if}

			<p class="text-subtle mt-1 text-[10px]">Sumber: {event.source.name}</p>
		</div>
	</div>
</a>
