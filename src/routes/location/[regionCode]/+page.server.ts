import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	findProvinceByCode,
	findRegencyByCode,
	isAdmCode,
	regencyCodeOf
} from '$lib/utils/regions';
import { getWeather, aggregateEvents, queryEvents } from '$lib/server/services/aggregate';
import { withinRadius } from '$lib/utils/geo';
import { assessRisk } from '$lib/server/risk/engine';
import { eventTimestamp } from '$lib/server/services/merge';
import type { DisasterEvent } from '$lib/types';
import type { NormalizedWeather } from '$lib/server/providers/bmkg/weather-normalizer';

/**
 * Region page load.
 *
 * A region code may be a province (2 digits, `31`), a regency (4 digits,
 * `31.71`), or a full adm4 (`31.71.01.1001`). BMKG weather is only fetchable for
 * adm4 — shallower levels return HTML — so for provinces/regencies we fall back
 * to the province capital's adm4, clearly labelled as representative.
 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const code = decodeURIComponent(params.regionCode);

	setHeaders({
		'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
	});

	const level: 1 | 2 | 3 | 4 | null = isAdmCode(1, code)
		? 1
		: isAdmCode(2, code)
			? 2
			: isAdmCode(3, code)
				? 3
				: isAdmCode(4, code)
					? 4
					: null;

	if (level === null) {
		throw error(404, { message: 'Kode wilayah tidak valid.' });
	}

	const province = findProvinceByCode(code);
	const regencyCode = regencyCodeOf(code);
	const regency = regencyCode ? findRegencyByCode(regencyCode) : undefined;

	if (!province && !regency) {
		throw error(404, { message: 'Wilayah tidak ditemukan pada tabel kode wilayah.' });
	}

	const displayName = regency?.name ?? province?.name ?? code;
	const latitude = regency?.latitude ?? province?.latitude ?? null;
	const longitude = regency?.longitude ?? province?.longitude ?? null;
	const timeZone = province?.timeZone ?? null;

	// Weather is only available for adm4. Use the exact code when we have one,
	// otherwise the province capital's representative adm4.
	const adm4 = level === 4 ? code : (province?.capitalAdm4 ?? null);
	const weatherIsRepresentative = level !== 4 && adm4 !== null;

	let weather: NormalizedWeather | null = null;
	let weatherError: string | null = null;
	try {
		if (adm4) {
			const result = await getWeather(adm4);
			weather = result.weather;
		}
	} catch {
		weatherError = 'Prakiraan cuaca tidak dapat dimuat saat ini.';
	}

	// Nearby events + risk, best-effort; the page renders without them.
	let nearby: DisasterEvent[] = [];
	let risk = null;
	try {
		const aggregate = await aggregateEvents();
		const withCoords = aggregate.events.filter((event) => {
			const { latitude: lat, longitude: lon } = event.location;
			return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
		});

		if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
			nearby = withinRadius(
				withCoords.map((event) => ({
					event,
					latitude: event.location.latitude,
					longitude: event.location.longitude
				})),
				{ latitude: latitude as number, longitude: longitude as number },
				250
			)
				.map((entry) => ({
					...entry.event,
					metadata: {
						...entry.event.metadata,
						distanceKm: Math.round(entry.distanceKm * 10) / 10
					}
				}))
				.sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
				.slice(0, 12);
		}

		const scoped = province
			? queryEvents(aggregate.events, { provinces: [province.name] })
			: aggregate.events;
		risk = assessRisk({ events: scoped.length ? scoped : aggregate.events });
	} catch {
		/* nearby/risk are best-effort */
	}

	return {
		code,
		displayName,
		provinceName: province?.name ?? null,
		regencyName: regency?.name ?? null,
		level,
		latitude,
		longitude,
		timeZone,
		adm4,
		weatherIsRepresentative,
		weather,
		weatherError,
		nearby,
		risk
	};
};
