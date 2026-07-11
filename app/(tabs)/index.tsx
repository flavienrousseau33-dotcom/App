import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';
import { formatDateRange } from '@/lib/format';
import { requestPhotoScanPermissions, scanPhotosAndSyncStays, type ScanProgress } from '@/lib/photoScan';
import { supabase } from '@/lib/supabase';
import type { Stay } from '@/types/database';

const PHASE_LABELS: Record<ScanProgress['phase'], string> = {
  permission: 'Demande des autorisations…',
  listing: 'Recherche des photos…',
  reading: 'Lecture des photos…',
  geocoding: 'Identification des villes…',
  saving: 'Sauvegarde…',
  done: 'Terminé',
};

export default function TimelineScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStays = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('stays')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }
    setStays(data ?? []);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    loadStays().finally(() => setLoading(false));
  }, [loadStays]);

  async function onRefresh() {
    setRefreshing(true);
    await loadStays();
    setRefreshing(false);
  }

  async function handleScan() {
    if (!user) return;
    setError(null);

    const permission = await requestPhotoScanPermissions();
    if (!permission.granted) {
      setError(permission.reason ?? 'Autorisations manquantes.');
      return;
    }

    setScanning(true);
    setProgress({ phase: 'listing', current: 0, total: 0 });
    try {
      await scanPhotosAndSyncStays(user.id, setProgress);
      await loadStays();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Le scan a échoué.');
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Pressable style={[styles.primaryButton, { backgroundColor: tint }]} onPress={handleScan} disabled={scanning}>
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Scanner mes photos</Text>
          )}
        </Pressable>
        <Link href="/stay/new" asChild>
          <Pressable style={StyleSheet.flatten([styles.secondaryButton, { borderColor: tint }])}>
            <Text style={[styles.secondaryButtonText, { color: tint }]}>Ajouter un séjour</Text>
          </Pressable>
        </Link>
      </View>

      {scanning && progress ? (
        <Text style={styles.progressText}>
          {PHASE_LABELS[progress.phase]}
          {progress.total > 0 ? ` (${progress.current}/${progress.total})` : ''}
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={stays}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.stayCard} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.stayCity}>
              {item.city}
              {item.country ? `, ${item.country}` : ''}
            </Text>
            <Text style={styles.stayDates}>{formatDateRange(item.start_date, item.end_date)}</Text>
            <Text style={styles.staySource}>
              {item.source === 'photos'
                ? `Depuis tes photos${item.photo_count ? ` (${item.photo_count})` : ''}`
                : 'Ajouté manuellement'}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Aucun séjour pour le moment</Text>
            <Text style={styles.emptySubtitle}>
              Scanne tes photos ou ajoute un séjour manuellement pour commencer à retracer ton trajet.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 60, paddingHorizontal: 24 },
  actions: { flexDirection: 'row', gap: 10, padding: 14 },
  primaryButton: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
  secondaryButtonText: { fontWeight: '700' },
  progressText: { textAlign: 'center', opacity: 0.6, marginBottom: 8 },
  error: { color: '#e33', textAlign: 'center', marginBottom: 8 },
  stayCard: { borderRadius: 14, padding: 14, marginHorizontal: 14, marginVertical: 6, gap: 3 },
  stayCity: { fontSize: 17, fontWeight: '700' },
  stayDates: { opacity: 0.7 },
  staySource: { opacity: 0.5, fontSize: 12, marginTop: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { opacity: 0.6, textAlign: 'center' },
});
