<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		actions?: Snippet;
	}

	let { title, subtitle, actions }: Props = $props();
</script>

<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
	<div>
		<h1 class="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
		{#if subtitle}
			<p class="text-subtle mt-0.5 max-w-3xl text-xs sm:text-sm">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex items-center gap-2">{@render actions()}</div>
	{/if}
</div>
