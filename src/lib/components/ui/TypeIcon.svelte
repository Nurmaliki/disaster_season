<script lang="ts">
	import type { DisasterType } from '$lib/types';
	import { DISASTER_TYPE_TOKENS } from '$lib/utils/severity';
	import {
		Activity,
		CalendarDays,
		CircleAlert,
		CloudLightning,
		CloudSun,
		Droplets,
		Flame,
		Mountain,
		Sun,
		Waves,
		Wind
	} from 'lucide-svelte';

	interface Props {
		type: DisasterType;
		size?: number;
		class?: string;
		/** Accessible label for the icon; omitted when purely decorative. */
		decorative?: boolean;
	}

	let { type, size = 16, class: className = '', decorative = true }: Props = $props();

	// Explicit map (not dynamic resolution) so the bundler can tree-shake icons.
	const ICONS = {
		Activity,
		CalendarDays,
		CircleAlert,
		CloudLightning,
		CloudSun,
		Droplets,
		Flame,
		Mountain,
		Sun,
		Waves,
		Wind
	} as const;

	const token = $derived(DISASTER_TYPE_TOKENS[type] ?? DISASTER_TYPE_TOKENS.other);
	const Icon = $derived(ICONS[token.icon as keyof typeof ICONS] ?? CircleAlert);
</script>

<Icon
	{size}
	class={className}
	aria-hidden={decorative}
	aria-label={decorative ? undefined : token.label}
/>
