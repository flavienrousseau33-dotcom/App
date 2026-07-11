export type GeoPoint = {
  timestamp: number; // ms since epoch
  latitude: number;
  longitude: number;
};

export type PhotoCluster = {
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string;
  latitude: number; // centroid
  longitude: number;
  photoCount: number;
};

const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function toIsoDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

/**
 * Groups geotagged photos into "stays": runs of consecutive (by time) photos
 * that stay within `maxDistanceKm` of the *running centroid* of the current
 * cluster (not just the previous photo, which would let a cluster slowly
 * drift across a whole region one small hop at a time) and don't have a gap
 * larger than `maxGapDays`. Each cluster becomes one candidate stay, later
 * reverse-geocoded to a city.
 *
 * The default radius is kept small (city-scale) on purpose: a single trip
 * that touches several distinct nearby places (e.g. two towns 20km apart)
 * should produce separate, precisely-located stays rather than being
 * averaged into one centroid that matches neither place.
 */
export function clusterPhotoPoints(
  points: GeoPoint[],
  options: { maxDistanceKm?: number; maxGapDays?: number } = {}
): PhotoCluster[] {
  const { maxDistanceKm = 15, maxGapDays = 10 } = options;
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);

  const clusters: PhotoCluster[] = [];
  let current: GeoPoint[] = [];
  let centroid: GeoPoint | null = null;

  const flush = () => {
    if (current.length === 0) return;
    const timestamps = current.map((p) => p.timestamp);
    clusters.push({
      startDate: toIsoDate(Math.min(...timestamps)),
      endDate: toIsoDate(Math.max(...timestamps)),
      latitude: centroid!.latitude,
      longitude: centroid!.longitude,
      photoCount: current.length,
    });
    current = [];
    centroid = null;
  };

  const updateCentroid = () => {
    centroid = {
      timestamp: 0,
      latitude: current.reduce((sum, p) => sum + p.latitude, 0) / current.length,
      longitude: current.reduce((sum, p) => sum + p.longitude, 0) / current.length,
    };
  };

  for (const point of sorted) {
    if (current.length === 0) {
      current.push(point);
      updateCentroid();
      continue;
    }

    const last = current[current.length - 1];
    const distanceKm = haversineDistanceKm(centroid!, point);
    const gapDays = (point.timestamp - last.timestamp) / (1000 * 60 * 60 * 24);

    if (distanceKm <= maxDistanceKm && gapDays <= maxGapDays) {
      current.push(point);
      updateCentroid();
    } else {
      flush();
      current.push(point);
      updateCentroid();
    }
  }
  flush();

  return clusters;
}

export function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function normalizeCityName(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}
