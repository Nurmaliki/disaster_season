<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		value: string | number;
		unit?: string;
		icon?: Snippet;
		hint?: string;
		tone?: 'neutral' | 'warning' | 'danger' | 'info';
		href?: string;
	}

	let { label, value, unit, icon, hint, tone = 'neutral', href }: Props = $props();

	const TONE_BORDER = {
		neutral: 'border-[var(--border)]',
		info: 'border-sky-300/70 dark:border-sky-500/40',
		warning: 'border-amber-300/70 dark:border-amber-500/40',
		danger: 'border-red-300/70 dark:border-red-500/40'
	};

	const TONE_VALUE = {
		neutral: 'text-[var(--fg)]',
		info: 'text-sky-700 dark:text-sky-300',
		warning: 'text-amber-700 dark:text-amber-300',
		danger: 'text-red-700 dark:text-red-300'
	};

	const Tag = $derived(href ? 'a' : 'div');
</script>

<svelte:element
	this={Tag}
	{href}
	class="card block px-4 py-3 {TONE_BORDER[tone]} {href
		? 'transition hover:border-[var(--border-strong)] hover:shadow-sm'
		: ''}"
>
	<div class="flex items-start justify-between gap-2">
		<p class="eyebrow">{label}</p>
		{#if icon}
			<span class="text-subtle">{@render icon()}</span>
		{/if}
	</div>
	<p class="mt-1 flex items-baseline gap-1">
		<span class="text-2xl font-bold tabular-nums {TONE_VALUE[tone]}">{value}</span>
		{#if unit}<span class="text-subtle text-xs">{unit}</span>{/if}
	</p>
	{#if hint}
		<p class="text-subtle mt-0.5 text-[11px]">{hint}</p>
	{/if}
</svelte:element>
