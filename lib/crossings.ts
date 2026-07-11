import { datesOverlap, haversineDistanceKm, normalizeCityName } from '@/lib/geo';
import type { NearMissCrossing, OverlapCrossing, Stay } from '@/types/database';

// Stays farther apart than this are treated as different places, even if a
// city-name match wasn't possible. City-level granularity means two people
// a short drive apart plausibly crossed paths; two different metro areas did
// not.
const PROXIMITY_KM_THRESHOLD = 150;
const MAX_RESULTS_PER_KIND = 15;

function distanceBetween(a: Stay, b: Stay): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return null;
  }
  return haversineDistanceKm(
    { timestamp: 0, latitude: a.latitude, longitude: a.longitude },
    { timestamp: 0, latitude: b.latitude, longitude: b.longitude }
  );
}

function isSamePlace(a: Stay, b: Stay, distanceKm: number | null): boolean {
  if (distanceKm != null) return distanceKm <= PROXIMITY_KM_THRESHOLD;
  // Neither stay has coordinates (e.g. an older manual entry) — fall back
  // to matching by city name.
  return normalizeCityName(a.city) === normalizeCityName(b.city);
}

function daysBetweenDates(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Finds every pair of (my stay, friend's stay) in the same place (by
 * distance when both have coordinates, otherwise by city name), split into:
 *  - `overlaps`: the two of you were there at the same time — ranked by how
 *    physically close you were (closest first).
 *  - `nearMisses`: same place, different times — ranked by how close in
 *    time you missed each other (smallest gap first).
 */
export function computeCrossings(
  myStays: Stay[],
  friendStays: Stay[]
): { overlaps: OverlapCrossing[]; nearMisses: NearMissCrossing[] } {
  const overlaps: OverlapCrossing[] = [];
  const nearMisses: NearMissCrossing[] = [];

  for (const mine of myStays) {
    for (const theirs of friendStays) {
      const distanceKm = distanceBetween(mine, theirs);
      if (!isSamePlace(mine, theirs, distanceKm)) continue;

      const base = {
        city: mine.city,
        friendCity: theirs.city,
        country: mine.country ?? theirs.country,
        distanceKm,
        myStay: mine,
        friendStay: theirs,
      };

      if (datesOverlap(mine.start_date, mine.end_date, theirs.start_date, theirs.end_date)) {
        overlaps.push({
          ...base,
          kind: 'overlap',
          overlapStart: mine.start_date > theirs.start_date ? mine.start_date : theirs.start_date,
          overlapEnd: mine.end_date < theirs.end_date ? mine.end_date : theirs.end_date,
        });
      } else {
        const dayGap =
          mine.end_date < theirs.start_date
            ? daysBetweenDates(mine.end_date, theirs.start_date)
            : daysBetweenDates(theirs.end_date, mine.start_date);

        nearMisses.push({ ...base, kind: 'near-miss', dayGap });
      }
    }
  }

  overlaps.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  nearMisses.sort((a, b) => a.dayGap - b.dayGap);

  return {
    overlaps: overlaps.slice(0, MAX_RESULTS_PER_KIND),
    nearMisses: nearMisses.slice(0, MAX_RESULTS_PER_KIND),
  };
}
