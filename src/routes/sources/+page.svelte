<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { apiGet } from '$lib/api/client';
	import type { SourcesPayload } from '$lib/api/types';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import { ExternalLink, ShieldCheck, Layers } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const seed = untrack(() => data);

	let sources = $state<SourcesPayload>(seed.sources);

	async function refresh(): Promise<void> {
		try {
			const response = await apiGet<SourcesPayload>('/api/sources');
			sources = response.data;
		} catch {
			/* keep SSR data; the catalogue is static so this rarely fails */
		}
	}

	const CATEGORY_LABELS: Record<string, string> = {
		forecast: 'Prakiraan',
		early_warning: 'Peringatan Dini',
		current_event: 'Kejadian Terkini',
		observation: 'Pengamatan',
		historical: 'Historis',
		hazard: 'Peta Bahaya',
		risk: 'Risiko'
	};

	void refresh;
</script>

<svelte:head>
	<title>Sumber Data &amp; Atribusi — Disaster Monitor</title>
	<meta
		name="description"
		content="Daftar sumber data resmi Indonesia yang digunakan aplikasi ini beserta atribusinya."
	/>
</svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Sumber Data &amp; Atribusi"
		subtitle="Semua data berasal dari instansi resmi Indonesia. Tidak ada data bencana yang dibuat-buat."
	/>

	<InlineNotice tone="info" title="Prinsip data">
		{sources.disclaimer}
	</InlineNotice>

	<div class="grid gap-3 md:grid-cols-2">
		{#each sources.sources as source (source.id)}
			<article class="card p-4">
				<div class="flex items-start justify-between gap-2">
					<div>
						<h2 class="text-sm font-bold">{source.name}</h2>
						<p class="text-subtle text-xs">{source.attribution}</p>
					</div>
					<a
						href={source.url}
						target="_blank"
						rel="external noopener noreferrer"
						class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
					>
						Kunjungi <ExternalLink size={11} aria-hidden="true" />
					</a>
				</div>

				<div class="mt-2 flex flex-wrap gap-1.5" aria-label="Kategori data">
					{#each source.categories as category (category)}
						<span
							class="surface-subtle rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium"
						>
							{CATEGORY_LABELS[category] ?? category}
						</span>
					{/each}
				</div>

				{#if source.domains.length > 0}
					<div class="text-subtle mt-2 flex items-center gap-1 text-[10px]">
						<Layers size={11} aria-hidden="true" />
						<span>{source.domains.join(', ')}</span>
					</div>
				{/if}

				{#if source.notes}
					<p class="text-subtle mt-2 text-[11px]">{source.notes}</p>
				{/if}
			</article>
		{/each}
	</div>

	<section class="card p-4">
		<h2 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
			<ShieldCheck size={15} aria-hidden="true" /> Pernyataan Penggunaan
		</h2>
		<ul class="text-subtle list-inside list-disc space-y-1 text-xs">
			<li>Data ditampilkan apa adanya dari sumber resmi, tanpa dimodifikasi secara substantif.</li>
			<li>
				Skor Risiko pada aplikasi ini adalah indikator internal, bukan peringatan resmi. Selalu
				ikuti informasi resmi BMKG, BNPB, BPBD, dan PVMBG.
			</li>
			<li>
				Aplikasi ini tidak memprediksi gempa bumi. Gempa ditampilkan sebagai catatan kejadian yang
				sudah berlangsung.
			</li>
			<li>
				Kategori data (prakiraan, peringatan dini, kejadian terkini, pengamatan, historis, peta
				bahaya, risiko) selalu dibedakan secara jelas dan tidak dicampur.
			</li>
			<li>
				Bila sumber tidak dapat dijangkau, aplikasi menampilkan status "tidak tersedia" alih-alih
				data pengganti.
			</li>
			<li>Peta dasar: © OpenStreetMap contributors, © CARTO.</li>
		</ul>
	</section>
</div>
