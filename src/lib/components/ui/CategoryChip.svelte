<script lang="ts">
	import type { DataCategory } from '$lib/types';
	import { CATEGORY_TOKENS } from '$lib/utils/severity';

	interface Props {
		category: DataCategory;
		size?: 'sm' | 'md';
	}

	let { category, size = 'sm' }: Props = $props();

	const token = $derived(CATEGORY_TOKENS[category] ?? CATEGORY_TOKENS.observation);

	const SIZES = {
		sm: 'px-2 py-0.5 text-[11px]',
		md: 'px-2.5 py-1 text-xs'
	};
</script>

<span
	class="inline-flex items-center rounded-md font-semibold {token.badgeClass} {SIZES[size]}"
	title={token.meaning}
	aria-label={`Kategori data: ${token.label}. ${token.meaning}`}
>
	{token.label}
</span>
