<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Menu,
		X,
		Moon,
		Sun,
		Map as MapIcon,
		TriangleAlert,
		Activity,
		Flame,
		CloudSun,
		ChartPie,
		CalendarRange,
		Info,
		HeartPulse
	} from 'lucide-svelte';
	import { theme, toggleTheme } from '$lib/stores/theme';
	import SearchBox from '$lib/components/search/SearchBox.svelte';

	let mobileOpen = $state(false);

	const NAV = [
		{ path: '/', label: 'Ringkasan', icon: ChartPie },
		{ path: '/map', label: 'Peta', icon: MapIcon },
		{ path: '/warnings', label: 'Peringatan Dini', icon: TriangleAlert },
		{ path: '/earthquakes', label: 'Gempa', icon: Activity },
		{ path: '/volcanoes', label: 'Gunung Api', icon: Flame },
		{ path: '/wildfire', label: 'Karhutla', icon: Flame },
		{ path: '/weather', label: 'Cuaca', icon: CloudSun },
		{ path: '/seasons', label: 'Musim', icon: CalendarRange },
		{ path: '/statistics', label: 'Statistik', icon: ChartPie },
		{ path: '/status', label: 'Status Sistem', icon: HeartPulse },
		{ path: '/sources', label: 'Sumber Data', icon: Info }
	] as const;

	const current = $derived(page.url.pathname);

	function isActive(href: string): boolean {
		if (href === '/') return current === '/';
		return current === href || current.startsWith(`${href}/`);
	}
</script>

<header class="surface-elevated/95 sticky top-0 z-40 border-b border-[var(--border)] backdrop-blur">
	<div class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:px-4">
		<a
			href={resolve('/')}
			class="flex shrink-0 items-center gap-2"
			aria-label="Beranda Indonesia Disaster Monitor"
		>
			<span class="grid h-8 w-8 place-items-center rounded-lg bg-sky-600 text-white">
				<Activity size={17} aria-hidden="true" />
			</span>
			<span class="hidden flex-col leading-none sm:flex">
				<span class="text-sm font-bold">Disaster &amp; Season Monitor</span>
				<span class="text-subtle text-[10px]">Indonesia · Sumber Resmi</span>
			</span>
		</a>

		<div class="ml-auto hidden min-w-0 flex-1 justify-end md:flex">
			<div class="w-full max-w-xs">
				<SearchBox />
			</div>
		</div>

		<nav class="hidden items-center gap-0.5 lg:flex" aria-label="Navigasi utama">
			{#each NAV.slice(0, 7) as item (item.path)}
				<a
					href={resolve(item.path)}
					class="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition {isActive(
						resolve(item.path)
					)
						? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
						: 'text-muted hover:surface-subtle'}"
					aria-current={isActive(resolve(item.path)) ? 'page' : undefined}
				>
					<item.icon size={14} aria-hidden="true" />
					{item.label}
				</a>
			{/each}
		</nav>

		<button
			type="button"
			onclick={toggleTheme}
			class="rounded-md border border-[var(--border)] p-1.5 transition hover:border-[var(--border-strong)]"
			aria-label={$theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
		>
			{#if $theme === 'dark'}
				<Sun size={16} aria-hidden="true" />
			{:else}
				<Moon size={16} aria-hidden="true" />
			{/if}
		</button>

		<button
			type="button"
			onclick={() => (mobileOpen = !mobileOpen)}
			class="rounded-md border border-[var(--border)] p-1.5 md:hidden"
			aria-expanded={mobileOpen}
			aria-label="Buka menu navigasi"
		>
			{#if mobileOpen}<X size={16} />{:else}<Menu size={16} />{/if}
		</button>
	</div>

	{#if mobileOpen}
		<div class="border-t border-[var(--border)] px-3 pt-2 pb-3 md:hidden">
			<div class="mb-2"><SearchBox onSelect={() => (mobileOpen = false)} /></div>
			<nav class="grid grid-cols-2 gap-1.5" aria-label="Navigasi seluler">
				{#each NAV as item (item.path)}
					<a
						href={resolve(item.path)}
						onclick={() => (mobileOpen = false)}
						class="inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition {isActive(
							resolve(item.path)
						)
							? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
							: 'surface-subtle text-muted'}"
					>
						<item.icon size={15} aria-hidden="true" />
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	{/if}
</header>
