/**
 * Pure geospatial helpers. No dependencies, fully unit-testable.
 * All distances are great-circle (haversine) in kilometres.
 */

const EARTH_RADIUS_KM = 6371.0088;

export function toRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points in kilometres. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const dLat = toRadians(lat2 - lat1);
	const dLon = toRadians(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface GeoPoint {
	latitude: number;
	longitude: number;
}

/** Returns items within `radiusKm` of `center`, sorted nearest-first. */
export function withinRadius<T extends GeoPoint>(
	items: T[],
	center: GeoPoint,
	radiusKm: number
): Array<T & { distanceKm: number }> {
	const out: Array<T & { distanceKm: number }> = [];
	for (const item of items) {
		if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) continue;
		const distanceKm = haversineKm(
			center.latitude,
			center.longitude,
			item.latitude,
			item.longitude
		);
		if (distanceKm <= radiusKm) out.push({ ...item, distanceKm });
	}
	return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Ray-casting point-in-polygon test. Ring must be [lon, lat] pairs. */
export function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
		if (intersects) inside = !inside;
	}
	return inside;
}

/**
 * Point-in-GeoJSON-Polygon/MultiPolygon test using the even-odd rule with
 * interior holes respected.
 */
export function pointInGeometry(
	lon: number,
	lat: number,
	geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): boolean {
	const polygons: number[][][][] =
		geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

	for (const polygon of polygons) {
		if (polygon.length === 0) continue;
		// Outer ring must contain the point; any hole containing it excludes it.
		if (!pointInRing(lon, lat, polygon[0])) continue;
		const inHole = polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
		if (!inHole) return true;
	}
	return false;
}

/** Bounding box of a GeoJSON geometry, as {minLon,minLat,maxLon,maxLat}. */
export function geometryBounds(geometry: GeoJSON.Geometry): {
	minLon: number;
	minLat: number;
	maxLon: number;
	maxLat: number;
} | null {
	let minLon = Infinity;
	let minLat = Infinity;
	let maxLon = -Infinity;
	let maxLat = -Infinity;
	let found = false;

	const visit = (value: unknown): void => {
		if (!Array.isArray(value)) return;
		if (typeof value[0] === 'number' && typeof value[1] === 'number') {
			const lon = value[0] as number;
			const lat = value[1] as number;
			if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
			found = true;
			if (lon < minLon) minLon = lon;
			if (lon > maxLon) maxLon = lon;
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
			return;
		}
		for (const child of value) visit(child);
	};

	if ('coordinates' in geometry) visit(geometry.coordinates);
	return found ? { minLon, minLat, maxLon, maxLat } : null;
}

/** Approximate centre of a geometry's bounding box. */
export function geometryCenter(geometry: GeoJSON.Geometry): GeoPoint | null {
	const bounds = geometryBounds(geometry);
	if (!bounds) return null;
	return {
		latitude: (bounds.minLat + bounds.maxLat) / 2,
		longitude: (bounds.minLon + bounds.maxLon) / 2
	};
}

/**
 * Indonesia's bounding box, used to reject implausible coordinates from
 * upstream providers before they reach the map.
 */
export const INDONESIA_BBOX = {
	minLat: -11.5,
	maxLat: 6.5,
	minLon: 94.5,
	maxLon: 141.5
} as const;

export function isWithinIndonesia(latitude: number, longitude: number): boolean {
	return (
		Number.isFinite(latitude) &&
		Number.isFinite(longitude) &&
		latitude >= INDONESIA_BBOX.minLat &&
		latitude <= INDONESIA_BBOX.maxLat &&
		longitude >= INDONESIA_BBOX.minLon &&
		longitude <= INDONESIA_BBOX.maxLon
	);
}

/** The eight principal compass directions, Indonesian, clockwise from north. */
export const COMPASS_POINTS_ID = [
	'Utara',
	'Timur Laut',
	'Timur',
	'Tenggara',
	'Selatan',
	'Barat Daya',
	'Barat',
	'Barat Laut'
] as const;

export type CompassPointId = (typeof COMPASS_POINTS_ID)[number];

/**
 * Maps a bearing (degrees clockwise from north) to the nearest of the eight
 * principal compass directions. Used for wind labels and the compass rose.
 */
export function bearingToCompass(degrees: number): CompassPointId {
	const normalized = ((degrees % 360) + 360) % 360;
	const index = Math.round(normalized / 45) % 8;
	return COMPASS_POINTS_ID[index];
}

/** Short Indonesian compass initials (U/TL/T/…), clockwise from north. */
export const COMPASS_ABBR_ID = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'] as const;
