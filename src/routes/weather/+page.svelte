<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import SearchBox from '$lib/components/search/SearchBox.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import { PROVINCES } from '$lib/utils/regions';
	import { CloudSun, Search, MapPin } from 'lucide-svelte';

	// Popular provinces surfaced first for quick access; the rest are searchable.
	const FEATURED = ['31', '32', '33', '34', '35', '36', '51', '52', '73', '65', '64', '71'];

	const featured = PROVINCES.filter((p) => FEATURED.includes(p.code));
	const others = PROVINCES.filter((p) => !FEATURED.includes(p.code));

	const TIMEZONE_LABEL = {
		'Asia/Jakarta': 'WIB',
		'Asia/Makassar': 'WITA',
		'Asia/Jayapura': 'WIT'
	} as const;
</script>

<svelte:head>
	<title>Cuaca Indonesia per Wilayah — Prakiraan BMKG</title>
	<meta
		name="description"
		content="Pilih wilayah untuk melihat prakiraan cuaca BMKG dan peristiwa terkini di sekitarnya."
	/>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-4">
	<PageHeader
		title="Cuaca per Wilayah"
		subtitle="Pilih provinsi, kabupaten/kota, atau cari wilayah untuk melihat prakiraan cuaca BMKG dan peristiwa di sekitarnya."
	/>

	<div class="card p-4">
		<label class="mb-2 flex items-center gap-1.5 text-sm font-semibold" for="region-search">
			<Search size={15} aria-hidden="true" /> Cari wilayah
		</label>
		<SearchBox />
		<p class="text-subtle mt-2 text-[11px]">
			Pencarian memakai tabel kode wilayah resmi dan tidak mengirim kueri Anda ke pihak ketiga.
		</p>
	</div>

	<section aria-labelledby="featured-heading" class="space-y-2">
		<h2 id="featured-heading" class="text-sm font-semibold">Provinsi Utama</h2>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{#each featured as province (province.code)}
				<a
					href={resolve('/location/[regionCode]', { regionCode: province.code })}
					class="card flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:border-[var(--border-strong)]"
				>
					<CloudSun size={15} class="shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
					<span class="truncate">{province.name}</span>
					<span class="text-subtle ml-auto shrink-0 text-[10px]">
						{TIMEZONE_LABEL[province.timeZone]}
					</span>
				</a>
			{/each}
		</div>
	</section>

	<section aria-labelledby="all-heading" class="space-y-2">
		<h2 id="all-heading" class="text-sm font-semibold">Semua Provinsi</h2>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{#each others as province (province.code)}
				<a
					href={resolve('/location/[regionCode]', { regionCode: province.code })}
					class="card flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:border-[var(--border-strong)]"
				>
					<MapPin size={14} class="text-subtle shrink-0" aria-hidden="true" />
					<span class="truncate">{province.name}</span>
					<span class="text-subtle ml-auto shrink-0 text-[10px]">
						{TIMEZONE_LABEL[province.timeZone]}
					</span>
				</a>
			{/each}
		</div>
	</section>

	<InlineNotice tone="info">
		Prakiraan cuaca BMKG tersedia pada tingkat desa/kelurahan (kode adm4). Untuk provinsi dan
		kabupaten/kota, aplikasi menampilkan prakiraan ibu kota wilayah sebagai perwakilan, dan hal ini
		ditandai secara eksplisit pada halaman wilayah.
	</InlineNotice>
</div>
