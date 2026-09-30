/**
 * Public region API.
 *
 * Provinces are bundled (small, stable). Regencies are bundled as a coordinate
 * reference table. District/village level data is deliberately NOT bundled:
 * it is huge and is resolved on demand through the BMKG weather endpoint, which
 * accepts adm4 codes directly.
 */
export {
	COUNTRY,
	isAdmCode,
	provinceCodeOf,
	regencyCodeOf,
	findProvinceByCode,
	searchRegions,
	findRegencyByCode,
	regenciesOfProvince,
	nearestRegion,
	haversineKm,
	REGENCIES
} from '$lib/data/regencies';

export type { RegionRef, RegencyEntry } from '$lib/data/regencies';

export { PROVINCES, findProvince } from '$lib/data/provinces';
export type { Province } from '$lib/data/provinces';
