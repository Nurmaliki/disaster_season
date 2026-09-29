<script lang="ts">
	import { resolve } from '$app/paths';
	import { ExternalLink } from 'lucide-svelte';

	const YEAR = new Date().getFullYear();
</script>

<footer class="surface-elevated mt-10 border-t border-[var(--border)]">
	<div class="mx-auto max-w-7xl px-4 py-8">
		<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
			<div>
				<p class="text-sm font-bold">Disaster &amp; Season Monitor</p>
				<p class="text-subtle mt-1 text-xs">
					Pemantauan cuaca, musim, peringatan dini, dan bencana Indonesia. Seluruh data bersumber
					dari instansi resmi Indonesia.
				</p>
			</div>

			<div>
				<p class="eyebrow mb-2">Sumber Resmi</p>
				<ul class="space-y-1 text-xs">
					<li>
						<a
							class="text-muted inline-flex items-center gap-1 hover:underline"
							href="https://www.bmkg.go.id"
							target="_blank"
							rel="noopener noreferrer"
						>
							BMKG <ExternalLink size={11} aria-hidden="true" />
						</a>
					</li>
					<li>
						<a
							class="text-muted inline-flex items-center gap-1 hover:underline"
							href="https://bnpb.go.id"
							target="_blank"
							rel="noopener noreferrer"
						>
							BNPB <ExternalLink size={11} aria-hidden="true" />
						</a>
					</li>
					<li>
						<a
							class="text-muted inline-flex items-center gap-1 hover:underline"
							href="https://magma.esdm.go.id"
							target="_blank"
							rel="noopener noreferrer"
						>
							PVMBG / MAGMA <ExternalLink size={11} aria-hidden="true" />
						</a>
					</li>
					<li>
						<a
							class="text-muted inline-flex items-center gap-1 hover:underline"
							href="https://inarisk.bnpb.go.id"
							target="_blank"
							rel="noopener noreferrer"
						>
							InaRISK <ExternalLink size={11} aria-hidden="true" />
						</a>
					</li>
				</ul>
			</div>

			<div>
				<p class="eyebrow mb-2">Aplikasi</p>
				<ul class="space-y-1 text-xs">
					<li>
						<a class="text-muted hover:underline" href={resolve('/sources')}
							>Sumber data &amp; atribusi</a
						>
					</li>
					<li>
						<a class="text-muted hover:underline" href={resolve('/status')}>Status sistem</a>
					</li>
					<li>
						<a class="text-muted hover:underline" href={resolve('/statistics')}>Statistik</a>
					</li>
					<li>
						<a class="text-muted hover:underline" href={resolve('/about')}
							>Tentang &amp; disclaimer</a
						>
					</li>
				</ul>
			</div>

			<div>
				<p class="eyebrow mb-2">Penting</p>
				<p class="text-subtle text-xs">
					Aplikasi ini <strong>bukan</strong> sumber peringatan resmi dan
					<strong>tidak memprediksi</strong>
					gempa bumi. Selalu ikuti informasi resmi BMKG, BNPB, BPBD, dan PVMBG.
				</p>
			</div>
		</div>

		<div class="mt-6 border-t border-[var(--border)] pt-4">
			<p class="text-subtle text-[11px] leading-relaxed">
				Data gempa bumi dan peringatan dini cuaca: BMKG. Tingkat aktivitas gunung api: PVMBG/MAGMA.
				Kejadian bencana dan peta bahaya: BNPB dan InaRISK. Peta dasar: ©
				<a
					class="underline"
					href="https://www.openstreetmap.org/copyright"
					target="_blank"
					rel="noopener noreferrer">OpenStreetMap</a
				>
				penyumbang, ©
				<a
					class="underline"
					href="https://carto.com/attributions"
					target="_blank"
					rel="noopener noreferrer">CARTO</a
				>. Zona waktu Indonesia (WIB/WITA/WIT) mengikuti wilayah masing-masing.
			</p>
			<p class="text-subtle mt-2 text-[11px]">
				© {YEAR} — Dibuat untuk pemantauan publik. Tidak ada data bencana yang dibuat-buat; bila sumber
				tidak dapat dijangkau, aplikasi menampilkan status tidak tersedia.
			</p>
		</div>
	</div>
</footer>
