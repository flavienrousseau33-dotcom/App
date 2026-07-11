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
 * that stay within `maxDistanceKm` of the previous photo and don't have a
 * gap larger than `maxGapDays`. Each cluster becomes one candidate stay,
 * later reverse-geocoded to a city.
 */
export function clusterPhotoPoints(
  points: GeoPoint[],
  options: { maxDistanceKm?: number; maxGapDays?: number } = {}
): PhotoCluster[] {
  const { maxDistanceKm = 40, maxGapDays = 10 } = options;
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);

  const clusters: PhotoCluster[] = [];
  let current: GeoPoint[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const latitude = current.reduce((sum, p) => sum + p.latitude, 0) / current.length;
    const longitude = current.reduce((sum, p) => sum + p.longitude, 0) / current.length;
    const timestamps = current.map((p) => p.timestamp);
    clusters.push({
      startDate: toIsoDate(Math.min(...timestamps)),
      endDate: toIsoDate(Math.max(...timestamps)),
      latitude,
      longitude,
      photoCount: current.length,
    });
    current = [];
  };

  for (const point of sorted) {
    if (current.length === 0) {
      current.push(point);
      continue;
    }

    const last = current[current.length - 1];
    const distanceKm = haversineDistanceKm(last, point);
    const gapDays = (point.timestamp - last.timestamp) / (1000 * 60 * 60 * 24);

    if (distanceKm <= maxDistanceKm && gapDays <= maxGapDays) {
      current.push(point);
    } else {
      flush();
      current.push(point);
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
