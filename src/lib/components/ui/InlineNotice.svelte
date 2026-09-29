<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
		title?: string;
		/** When set, renders as an inline warning with an icon. */
		role?: 'status' | 'alert';
		actions?: Snippet;
	}

	let { children, tone = 'neutral', title, role = 'status', actions }: Props = $props();

	const TONES: Record<NonNullable<Props['tone']>, string> = {
		neutral: 'border-[var(--border)] surface-subtle text-[var(--fg-muted)]',
		info: 'border-sky-300/60 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100',
		success:
			'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100',
		warning:
			'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100',
		danger:
			'border-red-300/60 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-100'
	};
</script>

<div class="rounded-xl border px-3 py-2 text-sm {TONES[tone]}" {role}>
	{#if title}
		<p class="font-semibold">{title}</p>
	{/if}
	<div class="[&_a]:underline">
		{@render children()}
	</div>
	{#if actions}
		<div class="mt-2">{@render actions()}</div>
	{/if}
</div>
