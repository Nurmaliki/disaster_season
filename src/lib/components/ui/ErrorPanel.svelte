<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	/**
	 * Error panel shown when a resource fetch fails.
	 *
	 * We deliberately render the failure instead of hiding it: a user must know
	 * when data could not be retrieved from an official source, so they do not
	 * assume "no events" when the truth is "no connection".
	 */
	interface Props {
		message: string;
		title?: string;
		retry?: () => void;
		children?: Snippet;
	}

	let { message, title = 'Data tidak dapat dimuat', retry, children }: Props = $props();
</script>

<div
	class="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/40 dark:bg-amber-950/40"
	role="alert"
>
	<div class="flex items-start gap-2">
		<AlertTriangle
			size={18}
			class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
			aria-hidden="true"
		/>
		<div class="space-y-1">
			<p class="font-semibold text-amber-900 dark:text-amber-100">{title}</p>
			<p class="text-amber-800 dark:text-amber-200">{message}</p>
			<p class="text-xs text-amber-700/90 dark:text-amber-300/90">
				Data resmi mungkin sedang tidak dapat dijangkau. Aplikasi menampilkan status ini alih-alih
				data pengganti.
			</p>
			{#if children}
				{@render children()}
			{/if}
			{#if retry}
				<button
					type="button"
					onclick={retry}
					class="mt-1 rounded-md border border-amber-400 px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-500 dark:text-amber-100 dark:hover:bg-amber-900/40"
				>
					Coba lagi
				</button>
			{/if}
		</div>
	</div>
</div>
