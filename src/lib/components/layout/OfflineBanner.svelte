<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { WifiOff } from 'lucide-svelte';

	/**
	 * Offline banner.
	 *
	 * Makes the offline state explicit rather than silently showing stale data.
	 * We use the browser's online/offline events plus a fetch failure signal.
	 */
	let online = $state(true);

	function update(): void {
		online = navigator.onLine;
	}

	if (browser) {
		update();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
	}

	onDestroy(() => {
		if (!browser) return;
		window.removeEventListener('online', update);
		window.removeEventListener('offline', update);
	});
</script>

{#if !online}
	<div
		class="sticky top-0 z-50 border-b border-amber-400/60 bg-amber-100 px-3 py-2 text-center text-xs font-medium text-amber-900 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100"
		role="alert"
	>
		<span class="inline-flex items-center gap-1.5">
			<WifiOff size={14} aria-hidden="true" />
			Anda sedang offline. Menampilkan data yang tersimpan di perangkat. Beberapa data mungkin tidak terbaru.
		</span>
	</div>
{/if}
