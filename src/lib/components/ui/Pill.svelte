<script lang="ts">
	interface Props {
		label: string;
		size?: 'sm' | 'md';
	}
	let { label, size = 'sm' }: Props = $props();

	const SIZES = {
		sm: 'px-2 py-0.5 text-[11px]',
		md: 'px-2.5 py-1 text-xs'
	};
</script>

<span
	class="surface-subtle text-muted inline-flex items-center gap-1 rounded-full border border-[var(--border)] font-medium {SIZES[
		size
	]}"
>
	{label}
</span>
