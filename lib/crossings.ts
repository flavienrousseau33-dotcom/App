import { datesOverlap, haversineDistanceKm, normalizeCityName } from '@/lib/geo';
import type { Crossing, CrossingBase, NearMissCrossing, OverlapCrossing, Stay } from '@/types/database';

// Stays farther apart than this are treated as different places, even if a
// city-name match wasn't possible. Kept in sync with stays_are_close() in
// supabase/schema.sql, which enforces the same radius at the database level.
const PROXIMITY_KM_THRESHOLD = 20;
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

export type TimelineEntry = { date: string; crossing: Crossing };

/**
 * Merges overlaps and near-misses into a single chronological timeline
 * (most recent first), so time proximity is visible at a glance instead of
 * split across two separate lists.
 */
export function buildCrossingTimeline(overlaps: OverlapCrossing[], nearMisses: NearMissCrossing[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...overlaps.map((crossing) => ({ date: crossing.overlapStart, crossing })),
    ...nearMisses.map((crossing) => ({
      // Anchor near-misses on the moment the gap started (the end of
      // whichever stay happened first).
      date: crossing.myStay.start_date < crossing.friendStay.start_date ? crossing.myStay.end_date : crossing.friendStay.end_date,
      crossing,
    })),
  ];

  return entries.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function crossingLocationLabel(crossing: CrossingBase): string {
  if (crossing.city.toLowerCase() === crossing.friendCity.toLowerCase()) {
    return crossing.country ? `${crossing.city}, ${crossing.country}` : crossing.city;
  }
  return `${crossing.city} ↔ ${crossing.friendCity}`;
}

export function crossingDistanceLabel(distanceKm: number | null): string | null {
  if (distanceKm == null) return null;
  if (distanceKm < 1) return "à moins d'1 km";
  return `à ${Math.round(distanceKm)} km`;
}
