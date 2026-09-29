<script lang="ts">
	import { WifiOff } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Offline — Disaster Monitor</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-md space-y-4 py-16 text-center">
	<WifiOff size={40} class="text-subtle mx-auto" aria-hidden="true" />
	<h1 class="text-xl font-bold">Anda sedang offline</h1>
	<p class="text-subtle text-sm">
		Aplikasi tidak dapat menjangkau server untuk memuat data terbaru. Data yang sudah tersimpan di
		perangkat mungkin masih dapat dilihat, tetapi bisa jadi sudah tidak terbaru.
	</p>
	<p class="text-subtle text-xs">
		Terhubung kembali ke internet untuk memuat data resmi terbaru dari BMKG, PVMBG/MAGMA, dan BNPB.
	</p>
	<button
		type="button"
		onclick={() => location.reload()}
		class="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
	>
		Coba muat ulang
	</button>
</div>
