import { supabase } from '@/lib/supabase';
import { clusterPhotoPoints, type GeoPoint } from '@/lib/geo';
import type { Stay } from '@/types/database';

// Scanning thousands of assets means thousands of native calls to read EXIF
// location, so we cap how many recent photos we look at for a first pass.
const MAX_ASSETS_TO_SCAN = 1500;
const ASSET_INFO_BATCH_SIZE = 25;

export type ScanProgress = {
  phase: 'permission' | 'listing' | 'reading' | 'geocoding' | 'saving' | 'done';
  current: number;
  total: number;
};

export type ScanResult = {
  staysCreated: number;
  photosWithLocation: number;
  photosScanned: number;
};

export async function requestPhotoScanPermissions(): Promise<{ granted: boolean; reason?: string }> {
  const MediaLibrary = await import('expo-media-library');
  const Location = await import('expo-location');

  const mediaPermission = await MediaLibrary.requestPermissionsAsync();
  if (!mediaPermission.granted) {
    return { granted: false, reason: "Accès à la photothèque refusé." };
  }

  // expo-location's reverse-geocoding call is gated behind a location
  // permission even though we never read the device's own GPS position here.
  const locationPermission = await Location.requestForegroundPermissionsAsync();
  if (locationPermission.status !== 'granted') {
    return { granted: false, reason: 'Accès à la localisation refusé (nécessaire pour identifier les villes).' };
  }

  return { granted: true };
}

async function collectGeoTaggedPoints(
  onProgress?: (progress: ScanProgress) => void
): Promise<{ points: GeoPoint[]; photosScanned: number }> {
  const { AssetField, MediaType, Query } = await import('expo-media-library');

  onProgress?.({ phase: 'listing', current: 0, total: 0 });

  const assets = await new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(MAX_ASSETS_TO_SCAN)
    .exe();

  const points: GeoPoint[] = [];

  for (let i = 0; i < assets.length; i += ASSET_INFO_BATCH_SIZE) {
    const batch = assets.slice(i, i + ASSET_INFO_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (asset) => {
        try {
          const [creationTime, location] = await Promise.all([asset.getCreationTime(), asset.getLocation()]);
          return { creationTime, location };
        } catch {
          return null;
        }
      })
    );

    for (const result of results) {
      if (result?.location && result.creationTime) {
        points.push({
          timestamp: result.creationTime,
          latitude: result.location.latitude,
          longitude: result.location.longitude,
        });
      }
    }

    onProgress?.({ phase: 'reading', current: Math.min(i + ASSET_INFO_BATCH_SIZE, assets.length), total: assets.length });
  }

  return { points, photosScanned: assets.length };
}

/**
 * Scans the device's photo library, clusters geotagged photos into stays,
 * reverse-geocodes each cluster to a city, and syncs the result to Supabase.
 * Only the derived city/date summaries leave the device — raw GPS points and
 * the photos themselves are never uploaded.
 */
export async function scanPhotosAndSyncStays(
  userId: string,
  onProgress?: (progress: ScanProgress) => void
): Promise<ScanResult> {
  const Location = await import('expo-location');

  const { points, photosScanned } = await collectGeoTaggedPoints(onProgress);

  const clusters = clusterPhotoPoints(points);

  onProgress?.({ phase: 'geocoding', current: 0, total: clusters.length });

  const stays: Array<Pick<Stay, 'city' | 'region' | 'country' | 'latitude' | 'longitude' | 'start_date' | 'end_date' | 'photo_count'>> = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    try {
      const [place] = await Location.reverseGeocodeAsync({
        latitude: cluster.latitude,
        longitude: cluster.longitude,
      });

      const city = place?.city || place?.subregion || place?.district;
      if (city) {
        stays.push({
          city,
          region: place?.region ?? null,
          country: place?.country ?? null,
          latitude: cluster.latitude,
          longitude: cluster.longitude,
          start_date: cluster.startDate,
          end_date: cluster.endDate,
          photo_count: cluster.photoCount,
        });
      }
    } catch {
      // Skip clusters we can't resolve to a place name.
    }
    onProgress?.({ phase: 'geocoding', current: i + 1, total: clusters.length });
  }

  onProgress?.({ phase: 'saving', current: 0, total: stays.length });

  // Replace any previously computed photo-derived stays with this fresh scan.
  await supabase.from('stays').delete().eq('user_id', userId).eq('source', 'photos');

  if (stays.length > 0) {
    const { error } = await supabase.from('stays').insert(
      stays.map((stay) => ({
        ...stay,
        user_id: userId,
        source: 'photos' as const,
      }))
    );
    if (error) throw error;
  }

  onProgress?.({ phase: 'done', current: stays.length, total: stays.length });

  return {
    staysCreated: stays.length,
    photosWithLocation: points.length,
    photosScanned,
  };
}
