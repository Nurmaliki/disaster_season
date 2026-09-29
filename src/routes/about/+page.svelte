<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import { RISK_DISCLAIMER } from '$lib/utils/risk';
	import { ShieldAlert, Info, Database, Lock, Globe } from 'lucide-svelte';

	/** Client-safe disclaimer text (public statement, not a secret). */
	const DISCLAIMER = RISK_DISCLAIMER;
</script>

<svelte:head>
	<title>Tentang &amp; Disclaimer — Disaster Monitor</title>
	<meta
		name="description"
		content="Tentang aplikasi, sumber data, batasan, dan disclaimer penggunaan."
	/>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-5">
	<PageHeader
		title="Tentang Aplikasi"
		subtitle="Pemantauan cuaca, musim, peringatan dini, dan bencana Indonesia berdasarkan sumber data resmi."
	/>

	<section class="card p-4">
		<h2 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
			<Info size={15} aria-hidden="true" /> Apa yang dilakukan aplikasi ini
		</h2>
		<p class="text-subtle text-xs leading-relaxed">
			Aplikasi ini mengumpulkan dan menampilkan data cuaca, musim, peringatan dini, gempa bumi,
			aktivitas gunung api, dan informasi bencana dari instansi resmi Indonesia. Data disajikan
			melalui peta interaktif, daftar peristiwa, dan ringkasan statistik. Aplikasi juga menghitung <em
				>Skor Risiko</em
			>
			internal sebagai indikator bantu, yang harus selalu dibaca bersama disclaimer di bawah.
		</p>
	</section>

	<section class="card border-red-300/70 p-4 dark:border-red-500/40">
		<h2 class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300">
			<ShieldAlert size={15} aria-hidden="true" /> Disclaimer Skor Risiko
		</h2>
		<p class="text-muted text-xs leading-relaxed">{DISCLAIMER}</p>
		<p class="text-subtle mt-2 text-xs leading-relaxed">
			Skor Risiko bersifat <strong>indikator internal aplikasi</strong> dan sepenuhnya transparan: setiap
			faktor penilaian, bobotnya, dan alasannya dapat dilihat pada rincian di halaman ringkasan. Skor
			ini tidak boleh dijadikan dasar tunggal untuk keputusan keselamatan.
		</p>
	</section>

	<section class="card p-4">
		<h2 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
			<Database size={15} aria-hidden="true" /> Sumber data
		</h2>
		<ul class="text-subtle space-y-1.5 text-xs">
			<li>
				<strong class="text-muted">BMKG</strong> — gempa bumi, prakiraan cuaca, peringatan dini cuaca
				(CAP).
			</li>
			<li><strong class="text-muted">PVMBG / MAGMA</strong> — tingkat aktivitas gunung api.</li>
			<li><strong class="text-muted">BNPB / DIBI</strong> — kejadian bencana (bila tersedia).</li>
			<li><strong class="text-muted">InaRISK</strong> — peta bahaya wilayah (bila tersedia).</li>
			<li>
				<strong class="text-muted">BPS/BIG</strong> — kode wilayah administratif dan koordinat referensi.
			</li>
			<li><strong class="text-muted">OpenStreetMap / CARTO</strong> — peta dasar.</li>
		</ul>
	</section>

	<section class="card p-4">
		<h2 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
			<Globe size={15} aria-hidden="true" /> Batasan yang perlu diketahui
		</h2>
		<ul class="text-subtle list-inside list-disc space-y-1 text-xs">
			<li>
				Aplikasi ini <strong>tidak memprediksi</strong> gempa bumi. Gempa ditampilkan sebagai catatan
				kejadian yang sudah berlangsung.
			</li>
			<li>Peringatan dini yang sudah berakhir tidak ditampilkan sebagai peringatan aktif.</li>
			<li>
				Prakiraan cuaca bukan peringatan. Kategori setiap data selalu ditampilkan secara eksplisit.
			</li>
			<li>
				Sebagian sumber (BNPB, InaRISK) mungkin tidak dapat dijangkau; aplikasi menampilkan status
				tidak tersedia.
			</li>
			<li>
				Tingkat keparahan gempa dan dampak bencana dihitung oleh aplikasi (ditandai "internal"),
				bukan klasifikasi resmi.
			</li>
			<li>Tingkat aktivitas gunung api adalah status resmi PVMBG dan tidak ditandai internal.</li>
		</ul>
	</section>

	<section class="card p-4">
		<h2 class="mb-2 flex items-center gap-1.5 text-sm font-semibold">
			<Lock size={15} aria-hidden="true" /> Privasi &amp; keamanan
		</h2>
		<ul class="text-subtle list-inside list-disc space-y-1 text-xs">
			<li>
				Lokasi hanya digunakan setelah Anda memberikan izin, dan hanya untuk memusatkan peta serta
				menghitung peristiwa terdekat di perangkat.
			</li>
			<li>
				Koordinat lokasi tidak disimpan secara persisten dan tidak dikirim ke penyedia data
				eksternal.
			</li>
			<li>
				Seluruh akses ke API eksternal dilakukan di sisi server; rahasia API tidak pernah dikirim ke
				peramban.
			</li>
			<li>
				Pencarian wilayah memakai data kode wilayah resmi yang dibundel, tanpa mengirim kueri ke
				pihak ketiga.
			</li>
		</ul>
	</section>
</div>
