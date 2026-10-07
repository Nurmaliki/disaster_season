<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import InlineNotice from '$lib/components/ui/InlineNotice.svelte';
	import ErrorPanel from '$lib/components/ui/ErrorPanel.svelte';
	import RiskBadge from '$lib/components/ui/RiskBadge.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import HumidityBadge from '$lib/components/ui/HumidityBadge.svelte';
	import HumidityTrend from '$lib/components/ui/HumidityTrend.svelte';
	import MapView from '$lib/components/map/MapView.svelte';
	import { formatTemperature, formatWind, formatHumidity, timezoneLabel } from '$lib/utils/format';
	import { classifyHumidity } from '$lib/utils/humidity';
	import { CloudSun, MapPin, Droplets, Wind, Thermometer } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const weather = $derived(data.weather);
	const levelLabel = $derived(
		data.level === 4
			? 'Desa/Kelurahan'
			: data.level === 3
				? 'Kecamatan'
				: data.level === 2
					? 'Kabupaten/Kota'
					: 'Provinsi'
	);

	const tz = $derived(
		weather
			? timezoneLabel(weather.location.timezone)
			: data.timeZone
				? timezoneLabel(data.timeZone)
				: null
	);
</script>

<svelte:head>
	<title>{data.displayName} — Cuaca &amp; Bencana — Disaster Monitor</title>
	<meta
		name="description"
		content={`Prakiraan cuaca dan peristiwa bencana terkini di ${data.displayName}.`}
	/>
</svelte:head>

<div class="space-y-4">
	<PageHeader
		title={data.displayName}
		subtitle={`${levelLabel}${data.provinceName && data.provinceName !== data.displayName ? ` · ${data.provinceName}` : ''}${tz ? ` · Zona waktu ${tz}` : ''}`}
	/>

	<!-- Weather -->
	{#if weather}
		<section class="card p-4" aria-labelledby="weather-heading">
			<div class="flex items-center justify-between">
				<h2 id="weather-heading" class="flex items-center gap-1.5 text-sm font-semibold">
					<CloudSun size={15} class="text-sky-600 dark:text-sky-400" aria-hidden="true" />
					Prakiraan Cuaca BMKG
				</h2>
				{#if data.weatherIsRepresentative}
					<span
						class="surface-subtle text-subtle rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px]"
					>
						Cuaca perkiraan ibu kota provinsi
					</span>
				{/if}
			</div>

			{#if weather.current}
				<div class="mt-3 flex flex-wrap items-center gap-4">
					{#if weather.current.iconUrl}
						<img src={weather.current.iconUrl} alt="" width="64" height="64" class="h-16 w-16" />
					{/if}
					<div>
						<p class="text-3xl font-bold">{formatTemperature(weather.current.temperatureC)}</p>
						<p class="text-muted text-sm">{weather.current.condition}</p>
					</div>
					<div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
						<span class="inline-flex items-center gap-1">
							<Droplets size={12} class="text-subtle" aria-hidden="true" />
							Kelembapan {formatHumidity(weather.current.humidity)}
						</span>
						<span class="inline-flex items-center gap-1">
							<Wind size={12} class="text-subtle" aria-hidden="true" />
							{formatWind(weather.current.windSpeedKmh, weather.current.windDirection)}
						</span>
						<span class="inline-flex items-center gap-1">
							<Thermometer size={12} class="text-subtle" aria-hidden="true" />
							Hujan {weather.current.precipitationMm ?? 0} mm
						</span>
					</div>
				</div>

				{#if weather.current.humidity !== null}
					<div class="mt-3">
						<HumidityBadge humidity={weather.current.humidity} size="md" />
						<span class="text-subtle ml-2 text-[11px]">
							{classifyHumidity(weather.current.humidity)?.description ?? ''}
						</span>
					</div>
				{/if}
			{/if}

			{#if weather.slots.length >= 2}
				<div class="mt-4">
					<h3 class="eyebrow mb-1.5 flex items-center gap-1.5">
						<Droplets size={12} class="text-sky-500" aria-hidden="true" />
						Tren Kelembapan per Jam
					</h3>
					<HumidityTrend slots={weather.slots} />
				</div>
			{/if}

			{#if weather.daily.length > 0}
				<h3 class="eyebrow mt-4 mb-2">Prakiraan Harian</h3>
				<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{#each weather.daily.slice(0, 6) as day (day.date)}
						<div class="surface-subtle rounded-lg border border-[var(--border)] p-2.5">
							<p class="text-xs font-semibold">{day.label}</p>
							<p class="text-subtle mt-0.5 text-[11px]">{day.dominantCondition}</p>
							<p class="mt-1 text-xs tabular-nums">
								{formatTemperature(day.minTempC)} – {formatTemperature(day.maxTempC)}
							</p>
							{#if day.avgHumidity !== null}
								<p class="text-subtle mt-1 flex items-center gap-1 text-[11px] tabular-nums">
									<Droplets size={11} aria-hidden="true" />
									RH rata-rata {formatHumidity(day.avgHumidity)}
									{#if day.minHumidity !== null && day.maxHumidity !== null}
										<span class="opacity-70">
											({formatHumidity(day.minHumidity)}–{formatHumidity(day.maxHumidity)})
										</span>
									{/if}
								</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<div class="mt-3 border-t border-[var(--border)] pt-2">
				<DataStatusBar
					source={weather.source.name}
					updatedAt={weather.updatedAt}
					cached
					notes={['Prakiraan bukan peringatan. Kategori: prakiraan.']}
				/>
			</div>
		</section>
	{:else}
		<ErrorPanel
			title="Prakiraan cuaca tidak tersedia"
			message={data.weatherError ?? 'Data prakiraan cuaca belum tersedia untuk wilayah ini.'}
		/>
	{/if}

	<!-- Risk -->
	{#if data.risk}
		<div class="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
			<RiskBadge assessment={data.risk} />
			{#if data.latitude !== null && data.longitude !== null}
				<div class="overflow-hidden rounded-xl border border-[var(--border)]">
					<MapView
						events={data.nearby}
						height="220px"
						syncUrl={false}
						showControls={false}
						initialCenter={[data.longitude, data.latitude]}
						initialZoom={8}
					/>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Nearby events -->
	<section aria-labelledby="nearby-heading" class="space-y-2">
		<h2 id="nearby-heading" class="flex items-center gap-1.5 text-sm font-semibold">
			<MapPin size={15} aria-hidden="true" /> Peristiwa dalam Radius 250 km
		</h2>
		{#if data.nearby.length > 0}
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.nearby as event (event.id)}
					<EventCard {event} compact />
				{/each}
			</div>
		{:else}
			<InlineNotice tone="neutral">
				Tidak ada peristiwa berkoordinat dalam radius 250 km dari wilayah ini pada data yang
				tersedia.
			</InlineNotice>
		{/if}
	</section>

	<InlineNotice tone="info">
		Lokasi ini dipilih dari tabel kode wilayah resmi. Koordinat wilayah digunakan untuk pemusatan
		peta dan perhitungan jarak saja, bukan sebagai data bahaya. Ikuti informasi resmi BMKG, BNPB,
		BPBD, dan PVMBG.
	</InlineNotice>
</div>
