<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Inbox, TriangleAlert, WifiOff } from 'lucide-svelte';

	interface Props {
		variant?: 'empty' | 'error' | 'offline';
		title: string;
		description?: string;
		action?: Snippet;
	}

	let { variant = 'empty', title, description, action }: Props = $props();

	const ICONS = { empty: Inbox, error: TriangleAlert, offline: WifiOff };
	const Icon = $derived(ICONS[variant]);
</script>

<div
	class="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-6 py-10 text-center"
>
	<Icon size={28} class="text-subtle" aria-hidden="true" />
	<p class="text-muted text-sm font-semibold">{title}</p>
	{#if description}
		<p class="text-subtle max-w-md text-xs">{description}</p>
	{/if}
	{#if action}
		<div class="mt-1">{@render action()}</div>
	{/if}
</div>
