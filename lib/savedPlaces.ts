import { haversineDistanceKm, normalizeCityName } from '@/lib/geo';
import { detectFrequentPlaces } from '@/lib/homeDetection';
import { supabase } from '@/lib/supabase';
import type { SavedPlace, Stay } from '@/types/database';

const MATCH_RADIUS_KM = 20;

function stayMatchesPlace(stay: Stay, place: Pick<SavedPlace, 'latitude' | 'longitude' | 'address'>): boolean {
  if (place.latitude != null && place.longitude != null && stay.latitude != null && stay.longitude != null) {
    return (
      haversineDistanceKm(
        { timestamp: 0, latitude: place.latitude, longitude: place.longitude },
        { timestamp: 0, latitude: stay.latitude, longitude: stay.longitude }
      ) <= MATCH_RADIUS_KM
    );
  }
  if (!place.address) return false;
  const normalizedAddress = normalizeCityName(place.address);
  const normalizedCity = normalizeCityName(stay.city);
  return normalizedAddress === normalizedCity || normalizedAddress.includes(normalizedCity);
}

/**
 * Applies a saved place's current is_hidden state to every stay of the
 * owner that currently matches it (by distance, or by address/city text
 * when coordinates are missing). Called whenever a saved place is created
 * or its toggle changes in "Paramètres > Lieux cachés".
 */
export async function syncStaysForSavedPlace(userId: string, place: Pick<SavedPlace, 'latitude' | 'longitude' | 'address' | 'is_hidden'>): Promise<number> {
  const { data: stays } = await supabase.from('stays').select('*').eq('user_id', userId).returns<Stay[]>();
  if (!stays) return 0;

  const matchingIds = stays.filter((s) => stayMatchesPlace(s, place)).map((s) => s.id);
  if (matchingIds.length === 0) return 0;

  await supabase.from('stays').update({ is_hidden: place.is_hidden }).in('id', matchingIds);
  return matchingIds.length;
}

/**
 * Called right after a new stay is created (photo scan or manual entry):
 * hides it immediately if it falls within an existing hidden saved place
 * (home/work/frequent), so newly recorded visits to a place you've already
 * chosen to hide don't leak out before the next sync.
 */
export async function applySavedPlacesToNewStay(userId: string, stay: Stay): Promise<boolean> {
  const { data: places } = await supabase
    .from('saved_places')
    .select('*')
    .eq('user_id', userId)
    .eq('is_hidden', true)
    .returns<SavedPlace[]>();

  if (!places || places.length === 0) return false;

  const matches = places.some((p) => stayMatchesPlace(stay, p));
  if (matches) {
    await supabase.from('stays').update({ is_hidden: true }).eq('id', stay.id);
  }
  return matches;
}

/**
 * Keeps the "Lieux fréquents" list in Paramètres up to date: for every
 * place the user has recorded 3+ separate visits to, makes sure a
 * `saved_places` row (kind='frequent') exists so it shows up with a
 * toggle — inserted as visible (is_hidden=false) by default, never
 * touched again once it exists so the user's toggle choice sticks.
 */
export async function ensureFrequentPlacesSaved(userId: string, stays: Stay[]): Promise<void> {
  const frequentPlaces = detectFrequentPlaces(stays);
  if (frequentPlaces.length === 0) return;

  const { data: existing } = await supabase
    .from('saved_places')
    .select('address')
    .eq('user_id', userId)
    .eq('kind', 'frequent')
    .returns<Pick<SavedPlace, 'address'>[]>();

  const existingKeys = new Set((existing ?? []).map((p) => normalizeCityName(p.address ?? '')));

  const toInsert = frequentPlaces
    .filter((place) => !existingKeys.has(normalizeCityName(place.city)))
    .map((place) => {
      const anchor = stays.find((s) => s.id === place.stayIds[0]);
      return {
        user_id: userId,
        kind: 'frequent' as const,
        address: place.country ? `${place.city}, ${place.country}` : place.city,
        latitude: anchor?.latitude ?? null,
        longitude: anchor?.longitude ?? null,
        is_hidden: false,
      };
    });

  if (toInsert.length > 0) {
    await supabase.from('saved_places').insert(toInsert);
  }
}
