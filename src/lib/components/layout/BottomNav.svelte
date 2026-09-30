<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ChartPie, Map as MapIcon, TriangleAlert, Activity, Flame } from 'lucide-svelte';

	/**
	 * Bottom navigation for small screens.
	 *
	 * Uses `pb-[env(safe-area-inset-bottom)]` so it clears the home indicator on
	 * notched devices, and is hidden from the tab order on desktop.
	 */
	const ITEMS = [
		{ path: '/', label: 'Ringkasan', icon: ChartPie },
		{ path: '/map', label: 'Peta', icon: MapIcon },
		{ path: '/warnings', label: 'Peringatan', icon: TriangleAlert },
		{ path: '/earthquakes', label: 'Gempa', icon: Activity },
		{ path: '/volcanoes', label: 'Gunung', icon: Flame },
		{ path: '/wildfire', label: 'Karhutla', icon: Flame }
	] as const;

	const current = $derived(page.url.pathname);

	function isActive(href: string): boolean {
		return href === '/' ? current === '/' : current === href || current.startsWith(`${href}/`);
	}
</script>

<nav
	class="surface-elevated/95 fixed right-0 bottom-0 left-0 z-40 border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
	aria-label="Navigasi bawah"
>
	<ul class="grid grid-cols-6">
		{#each ITEMS as item (item.path)}
			<li>
				<a
					href={resolve(item.path)}
					class="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition {isActive(
						resolve(item.path)
					)
						? 'text-sky-600 dark:text-sky-400'
						: 'text-subtle'}"
					aria-current={isActive(resolve(item.path)) ? 'page' : undefined}
				>
					<item.icon size={18} aria-hidden="true" />
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
