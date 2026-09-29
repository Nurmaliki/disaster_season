<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import { TriangleAlert, Home, Map as MapIcon } from 'lucide-svelte';

	// SvelteKit provides `page.status` and `page.error` on error pages.
	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Terjadi kesalahan yang tidak diketahui.');
</script>

<svelte:head>
	<title>{status} — Disaster Monitor</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-lg space-y-4 py-12 text-center">
	<span class="surface-subtle mx-auto grid h-14 w-14 place-items-center rounded-2xl">
		<TriangleAlert size={26} class="text-amber-600 dark:text-amber-400" aria-hidden="true" />
	</span>

	<h1 class="text-2xl font-bold tabular-nums">{status}</h1>
	<p class="text-muted text-sm">{message}</p>

	{#if status === 404}
		<p class="text-subtle text-xs">
			Halaman atau peristiwa yang Anda cari tidak ditemukan. Data bencana dapat berganti seiring
			pembaruan dari sumber resmi.
		</p>
	{:else}
		<InlineNotice tone="neutral">
			Jika masalah berlanjut, sumber data resmi mungkin sedang tidak dapat dijangkau. Silakan coba
			beberapa saat lagi.
		</InlineNotice>
	{/if}

	<div class="flex flex-wrap justify-center gap-2 pt-2">
		<a
			href={resolve('/')}
			class="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
		>
			<Home size={15} aria-hidden="true" /> Ke beranda
		</a>
		<a
			href={resolve('/map')}
			class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3.5 py-2 text-sm font-semibold transition hover:border-[var(--border-strong)]"
		>
			<MapIcon size={15} aria-hidden="true" /> Buka peta
		</a>
	</div>
</div>
