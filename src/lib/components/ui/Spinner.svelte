<script lang="ts">
	import { LoaderCircle } from 'lucide-svelte';

	interface Props {
		label?: string;
		size?: number;
	}
	let { label = 'Memuat data…', size = 18 }: Props = $props();
</script>

<div
	class="text-subtle flex items-center justify-center gap-2 py-6 text-sm"
	role="status"
	aria-live="polite"
>
	<LoaderCircle {size} class="animate-spin" aria-hidden="true" />
	<span>{label}</span>
</div>
