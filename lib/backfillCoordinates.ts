import * as Location from 'expo-location';

import { supabase } from '@/lib/supabase';
import type { Stay } from '@/types/database';

/**
 * Forward-geocodes any of the user's own stays that are missing
 * coordinates (only possible for manually-entered stays whose geocoding
 * failed at creation time — photo-derived stays always get coordinates
 * from the photo's own GPS data). Needed so every stay can participate in
 * distance-based crossing matching and frequent-place detection, not just
 * the city-name fallback.
 *
 * Best-effort: silently leaves a stay for the next attempt if geocoding
 * still fails or permission isn't granted.
 */
export async function backfillMissingCoordinates(userId: string): Promise<number> {
  const { data: stays } = await supabase
    .from('stays')
    .select('id, city, country')
    .eq('user_id', userId)
    .is('latitude', null)
    .returns<Pick<Stay, 'id' | 'city' | 'country'>[]>();

  if (!stays || stays.length === 0) return 0;

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return 0;

  let updated = 0;
  for (const stay of stays) {
    try {
      const query = stay.country ? `${stay.city}, ${stay.country}` : stay.city;
      const [coords] = await Location.geocodeAsync(query);
      if (coords) {
        const { error } = await supabase
          .from('stays')
          .update({ latitude: coords.latitude, longitude: coords.longitude })
          .eq('id', stay.id);
        if (!error) updated++;
      }
    } catch {
      // Leave it for the next attempt.
    }
  }
  return updated;
}
