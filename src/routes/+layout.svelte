<script lang="ts">
	import '../routes/layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import BottomNav from '$lib/components/layout/BottomNav.svelte';
	import OfflineBanner from '$lib/components/layout/OfflineBanner.svelte';
	import { initTheme } from '$lib/stores/theme';

	let { children } = $props();

	onMount(() => {
		const disposeTheme = initTheme();

		// Register the service worker for PWA installability and offline shell.
		if (browser && 'serviceWorker' in navigator) {
			window.addEventListener('load', () => {
				navigator.serviceWorker.register('/service-worker.js').catch((error) => {
					console.warn('[pwa] service worker registration failed', error);
				});
			});
		}

		return disposeTheme;
	});

	// Pages that render full-bleed (the map page) opt out of the vertical rhythm.
	const fullBleed = $derived(page.url.pathname === '/map');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="application-name" content="Indonesia Disaster Monitor" />
	<meta property="og:site_name" content="Indonesia Disaster & Season Monitor" />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="id_ID" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="flex min-h-full flex-col">
	<a
		href="#main"
		class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-sky-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
	>
		Lewati ke konten utama
	</a>

	<OfflineBanner />
	<Header />

	<main
		id="main"
		class="flex-1 {fullBleed ? '' : 'mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6'}"
	>
		{@render children()}
	</main>

	{#if !fullBleed}
		<Footer />
	{/if}

	<!-- Spacer so the fixed bottom nav never covers content. -->
	<div class="h-16 lg:hidden" aria-hidden="true"></div>
	<BottomNav />
</div>
