<script lang="ts">
	import type { NearbyPayload, WeatherPayload } from '$lib/api/types';
	import { apiGet } from '$lib/api/client';
	import { PROVINCES } from '$lib/data/provinces';
	import { nearestRegion } from '$lib/utils/regions';
	import { formatTemperature, formatWind, formatDistance, timezoneLabel } from '$lib/utils/format';
	import EventCard from '$lib/components/EventCard.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import {
		MapPin,
		LocateFixed,
		CloudSun,
		Droplets,
		Wind,
		Thermometer,
		LoaderCircle,
		X
	} from 'lucide-svelte';

	/**
	 * "Kondisi terdekat" — an opt-in panel that shows the weather and the nearby
	 * events for the device's current location.
	 *
	 * Design rules:
	 *  - It is entirely user-triggered. Nothing is requested (and no geolocation
	 *    prompt appears) until the user presses the button, so the page's default
	 *    appearance and behaviour are unchanged.
	 *  - PRIVACY: the coordinate is used only to call our own /api/nearby and
	 *    /api/weather gateway. It is never sent to a provider directly, and we do
	 *    not persist it. Weather uses the nearest province capital's adm4 because
	 *    BMKG only serves forecasts for adm4 codes and we deliberately do not
	 *    bundle the full village table; this is labelled as representative.
	 */
	interface Props {
		/** Radius (km) searched for nearby events. */
		radiusKm?: number;
		/** Notified when a location is resolved and loaded, so a parent can map it. */
		onLocated?: (center: { latitude: number; longitude: number }) => void;
	}

	let { radiusKm = 150, onLocated }: Props = $props();

	type Status = 'idle' | 'locating' | 'loading' | 'ready' | 'error';

	let status = $state<Status>('idle');
	let notice = $state<string | null>(null);
	let placeName = $state<string | null>(null);
	let weather = $state<WeatherPayload | null>(null);
	let weatherError = $state<string | null>(null);
	let events = $state<NearbyPayload['events']>([]);
	let filtered = $state(false);
	let showPanel = $state(false);

	const isInsideIndonesia = (lat: number, lng: number): boolean =>
		lat >= -11.5 && lat <= 6.5 && lng >= 94.5 && lng <= 141.5;

	function reset(): void {
		status = 'idle';
		showPanel = false;
		notice = null;
		placeName = null;
		weather = null;
		weatherError = null;
		events = [];
	}

	async function load(latitude: number, longitude: number): Promise<void> {
		status = 'loading';

		// Resolve a human place name locally (no network) for the header.
		const region = nearestRegion(latitude, longitude);
		placeName = region ? `${region.regency.name}, ${region.province.name}` : 'Lokasi Anda';

		// Weather is only available for adm4; use the nearest province capital's
		// representative code, clearly labelled as approximate.
		const provinceCode = region?.province.code ?? null;
		const province = provinceCode ? PROVINCES.find((p) => p.code === provinceCode) : undefined;
		const adm4 = province?.capitalAdm4 ?? null;

		const [weatherResult, nearbyResult] = await Promise.allSettled([
			adm4
				? apiGet<WeatherPayload>('/api/weather', { adm4 }, { timeoutMs: 30000 })
				: Promise.reject(new Error('no-adm4')),
			apiGet<NearbyPayload>(
				'/api/nearby',
				{ lat: latitude, lng: longitude, radiusKm },
				{
					timeoutMs: 30000
				}
			)
		]);

		if (weatherResult.status === 'fulfilled') {
			weather = weatherResult.value.data;
			weatherError = null;
		} else {
			weather = null;
			weatherError =
				adm4 === null
					? 'Wilayah ini berada di luar cakupan prakiraan BMKG.'
					: 'Prakiraan cuaca tidak dapat dimuat saat ini.';
		}

		if (nearbyResult.status === 'fulfilled') {
			events = nearbyResult.value.data.events;
			filtered = Boolean(nearbyResult.value.meta.searchedHistory);
		} else {
			events = [];
		}

		const bothEmpty = !weather && events.length === 0;
		if (bothEmpty) {
			notice = 'Data cuaca dan peristiwa terdekat tidak dapat dimuat saat ini.';
			status = 'error';
		} else {
			status = 'ready';
			showPanel = true;
		}
	}

	function locate(): void {
		if (!navigator.geolocation) {
			notice = 'Perangkat ini tidak mendukung geolokasi.';
			status = 'error';
			return;
		}

		status = 'locating';
		notice = null;

		navigator.geolocation.getCurrentPosition(
			(position) => {
				const { latitude, longitude } = position.coords;
				if (!isInsideIndonesia(latitude, longitude)) {
					notice = 'Lokasi Anda terdeteksi di luar wilayah Indonesia.';
					status = 'error';
					return;
				}
				onLocated?.({ latitude, longitude });
				void load(latitude, longitude);
			},
			(error) => {
				notice =
					error.code === error.PERMISSION_DENIED
						? 'Akses lokasi ditolak. Aktifkan izin lokasi untuk memakai fitur ini.'
						: 'Lokasi tidak dapat ditentukan saat ini.';
				status = 'error';
			},
			{ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
		);
	}

	const busy = $derived(status === 'locating' || status === 'loading');
</script>

<section class="card p-3" aria-labelledby="nearby-conditions-heading">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 id="nearby-conditions-heading" class="flex items-center gap-1.5 text-sm font-semibold">
			<MapPin size={15} class="shrink-0" aria-hidden="true" /> Kondisi di sekitar saya
		</h2>
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				onclick={locate}
				disabled={busy}
				class="surface-elevated inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition hover:border-[var(--border-strong)] disabled:opacity-60"
				title="Deteksi lokasi saya dan tampilkan cuaca serta peristiwa terdekat"
			>
				{#if busy}
					<LoaderCircle size={14} class="animate-spin" />
				{:else}
					<LocateFixed size={14} />
				{/if}
				{status === 'locating'
					? 'Mencari lokasi…'
					: status === 'loading'
						? 'Memuat…'
						: 'Lihat kondisi terdekat'}
			</button>
			{#if showPanel || status === 'error'}
				<button
					type="button"
					onclick={reset}
					class="text-subtle hover:text-muted rounded-lg p-1.5"
					aria-label="Tutup kondisi terdekat"
				>
					<X size={15} />
				</button>
			{/if}
		</div>
	</div>

	{#if status === 'idle' && !showPanel}
		<p class="text-subtle mt-1.5 text-[11px]">
			Tekan tombol untuk memakai lokasi Anda saat ini. Lokasi hanya dipakai di perangkat ini untuk
			menampilkan cuaca dan peristiwa terdekat, dan tidak dikirim ke penyedia data.
		</p>
	{/if}

	{#if notice}
		<div class="mt-2">
			<InlineNotice tone="warning">{notice}</InlineNotice>
		</div>
	{/if}

	{#if status === 'ready' && showPanel}
		<p class="text-subtle mt-1.5 text-[11px]">
			Berdasarkan perkiraan lokasi di <span class="font-medium">{placeName}</span>. Peristiwa dalam
			radius {radiusKm} km.
		</p>

		<!-- Weather combined card -->
		{#if weather?.current}
			<div class="surface-subtle mt-3 rounded-lg border border-[var(--border)] p-3">
				<div class="flex items-center justify-between">
					<span class="flex items-center gap-1.5 text-xs font-semibold">
						<CloudSun size={14} class="text-sky-600 dark:text-sky-400" aria-hidden="true" />
						Cuaca
					</span>
					<span class="text-subtle text-[10px]">
						{weather.location.village || weather.location.regency}
						· {timezoneLabel(weather.location.timezone)}
					</span>
				</div>
				<div class="mt-2 flex flex-wrap items-center gap-4">
					{#if weather.current.iconUrl}
						<img src={weather.current.iconUrl} alt="" width="48" height="48" class="h-12 w-12" />
					{/if}
					<div>
						<p class="text-2xl font-bold">{formatTemperature(weather.current.temperatureC)}</p>
						<p class="text-muted text-xs">{weather.current.condition}</p>
					</div>
					<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
						<span class="inline-flex items-center gap-1">
							<Droplets size={12} class="text-subtle" aria-hidden="true" />
							{weather.current.humidity ?? '—'}%
						</span>
						<span class="inline-flex items-center gap-1">
							<Wind size={12} class="text-subtle" aria-hidden="true" />
							{formatWind(weather.current.windSpeedKmh, weather.current.windDirection)}
						</span>
						<span class="inline-flex items-center gap-1">
							<Thermometer size={12} class="text-subtle" aria-hidden="true" />
							{weather.current.precipitationMm ?? 0} mm
						</span>
					</div>
				</div>
				<p class="text-subtle mt-2 text-[10px]">
					Prakiraan BMKG pada titik perwakilan wilayah terdekat
					{weather.location.regency ? `(${weather.location.regency})` : ''} — bukan prakiraan presisi
					di titik Anda.
				</p>
			</div>
		{:else if weatherError}
			<div class="mt-3">
				<InlineNotice tone="neutral">{weatherError}</InlineNotice>
			</div>
		{/if}

		<!-- Nearby events -->
		<div class="mt-3">
			<h3 class="eyebrow mb-2">Peristiwa terdekat ({events.length})</h3>
			{#if events.length > 0}
				<div class="grid gap-2 sm:grid-cols-2">
					{#each events.slice(0, 8) as event (event.id)}
						<div class="relative">
							<EventCard {event} compact />
							{#if Number.isFinite(Number(event.metadata?.distanceKm))}
								<span
									class="surface-elevated text-subtle absolute top-1.5 right-1.5 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-medium"
								>
									{formatDistance(Number(event.metadata?.distanceKm))}
								</span>
							{/if}
						</div>
					{/each}
				</div>
				{#if events.length > 8}
					<p class="text-subtle mt-1.5 text-[11px]">
						Menampilkan 8 dari {events.length} peristiwa terdekat.
					</p>
				{/if}
			{:else}
				<InlineNotice tone="neutral">
					Tidak ada peristiwa tercatat dalam radius {radiusKm} km dari lokasi Anda.
				</InlineNotice>
			{/if}
			{#if filtered}
				<p class="text-subtle mt-1.5 text-[10px]">Termasuk riwayat tersimpan.</p>
			{/if}
		</div>
	{/if}
</section>
