import { haversineDistanceKm, normalizeCityName } from '@/lib/geo';
import type { Stay } from '@/types/database';

const CLUSTER_RADIUS_KM = 20;
const MIN_RECURRENCE = 3;

export type FrequentPlace = {
  key: string;
  city: string;
  country: string | null;
  stayIds: string[];
  visitCount: number;
};

function isSamePlace(a: Stay, b: Stay): boolean {
  if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
    return (
      haversineDistanceKm(
        { timestamp: 0, latitude: a.latitude, longitude: a.longitude },
        { timestamp: 0, latitude: b.latitude, longitude: b.longitude }
      ) <= CLUSTER_RADIUS_KM
    );
  }
  // Neither stay has coordinates — fall back to matching by city name.
  return normalizeCityName(a.city) === normalizeCityName(b.city);
}

/**
 * Detects places a person keeps returning to (3+ separate stays within
 * 20km of each other, or the same city name when coordinates are missing)
 * — a strong signal for home, work, or family, as opposed to a one-off
 * trip. This is a heuristic, not a guarantee: it can miss a real home (not
 * enough recorded visits yet) or flag a place that's just a recurring
 * holiday spot.
 *
 * Pure and read-only — it never touches the database. The app only ever
 * *suggests* hiding these places to the owner; nothing gets hidden
 * automatically.
 */
export function detectFrequentPlaces(stays: Stay[], minRecurrence = MIN_RECURRENCE): FrequentPlace[] {
  const clusters: Stay[][] = [];

  for (const stay of stays) {
    const cluster = clusters.find((c) => isSamePlace(c[0], stay));
    if (cluster) cluster.push(stay);
    else clusters.push([stay]);
  }

  return clusters
    .filter((cluster) => cluster.length >= minRecurrence)
    .map((cluster) => ({
      key: normalizeCityName(cluster[0].city),
      city: cluster[0].city,
      country: cluster[0].country,
      stayIds: cluster.map((s) => s.id),
      visitCount: cluster.length,
    }))
    .sort((a, b) => b.visitCount - a.visitCount);
}
