import { datesOverlap, normalizeCityName } from '@/lib/geo';
import type { Crossing, Stay } from '@/types/database';

/**
 * Finds every pair of (my stay, friend's stay) that happened in the same
 * city during an overlapping time window — i.e. moments where two people's
 * paths may have crossed in the past.
 */
export function computeCrossings(myStays: Stay[], friendStays: Stay[]): Crossing[] {
  const crossings: Crossing[] = [];

  for (const mine of myStays) {
    for (const theirs of friendStays) {
      if (normalizeCityName(mine.city) !== normalizeCityName(theirs.city)) continue;
      if (!datesOverlap(mine.start_date, mine.end_date, theirs.start_date, theirs.end_date)) continue;

      crossings.push({
        city: mine.city,
        country: mine.country,
        overlapStart: mine.start_date > theirs.start_date ? mine.start_date : theirs.start_date,
        overlapEnd: mine.end_date < theirs.end_date ? mine.end_date : theirs.end_date,
        myStay: mine,
        friendStay: theirs,
      });
    }
  }

  return crossings.sort((a, b) => (a.overlapStart < b.overlapStart ? 1 : -1));
}
