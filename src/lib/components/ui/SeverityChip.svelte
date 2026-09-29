<script lang="ts">
	import type { Severity } from '$lib/types';
	import { SEVERITY_TOKENS } from '$lib/utils/severity';

	interface Props {
		severity: Severity;
		/** Show the longer label instead of the short one. */
		full?: boolean;
		/** Marks severities that this app computed rather than the authority. */
		internal?: boolean;
		size?: 'sm' | 'md';
	}

	let { severity, full = false, internal = false, size = 'sm' }: Props = $props();

	const token = $derived(SEVERITY_TOKENS[severity] ?? SEVERITY_TOKENS.unknown);
	const label = $derived(full ? token.label : token.shortLabel);

	const SIZES = {
		sm: 'px-2 py-0.5 text-[11px] gap-1',
		md: 'px-2.5 py-1 text-xs gap-1.5'
	};
</script>

<span
	class="inline-flex items-center rounded-full border font-semibold {token.bg} {token.text} {token.border} {SIZES[
		size
	]}"
	title={token.description}
>
	<!-- Glyph as well as colour, so severity is readable without colour vision. -->
	<span aria-hidden="true">{token.glyph}</span>
	<span>{label}</span>
	{#if internal}
		<span
			class="ml-0.5 rounded-sm border border-current px-1 text-[9px] font-bold tracking-wide uppercase opacity-80"
			title="Tingkat ini dihitung oleh aplikasi, bukan dipublikasikan oleh instansi resmi."
			>internal</span
		>
	{/if}
</span>
