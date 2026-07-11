import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';
import { backfillMissingCoordinates } from '@/lib/backfillCoordinates';
import { formatDateRange } from '@/lib/format';
import { detectFrequentPlaces, type FrequentPlace } from '@/lib/homeDetection';
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

function dismissedSuggestionsKey(userId: string) {
  return `traces:dismissed-suggestions:${userId}`;
}

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
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

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
    if (!user) return;
    setLoading(true);
    (async () => {
      const raw = await AsyncStorage.getItem(dismissedSuggestionsKey(user.id)).catch(() => null);
      setDismissedKeys(new Set(raw ? JSON.parse(raw) : []));
      await loadStays();
      const backfilled = await backfillMissingCoordinates(user.id).catch(() => 0);
      if (backfilled > 0) await loadStays();
    })().finally(() => setLoading(false));
  }, [user, loadStays]);

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

  async function toggleStayHidden(stay: Stay) {
    setStays((prev) => prev.map((s) => (s.id === stay.id ? { ...s, is_hidden: !s.is_hidden } : s)));
    await supabase.from('stays').update({ is_hidden: !stay.is_hidden }).eq('id', stay.id);
  }

  async function acceptSuggestion(place: FrequentPlace) {
    setStays((prev) => prev.map((s) => (place.stayIds.includes(s.id) ? { ...s, is_hidden: true } : s)));
    await supabase.from('stays').update({ is_hidden: true }).in('id', place.stayIds);
  }

  async function dismissSuggestion(place: FrequentPlace) {
    if (!user) return;
    const next = new Set(dismissedKeys);
    next.add(place.key);
    setDismissedKeys(next);
    await AsyncStorage.setItem(dismissedSuggestionsKey(user.id), JSON.stringify([...next]));
  }

  const suggestions = useMemo(() => {
    return detectFrequentPlaces(stays).filter(
      (place) => !dismissedKeys.has(place.key) && place.stayIds.some((id) => !stays.find((s) => s.id === id)?.is_hidden)
    );
  }, [stays, dismissedKeys]);

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
        ListHeaderComponent={
          suggestions.length > 0 ? (
            <View style={{ gap: 8, paddingHorizontal: 14, paddingBottom: 6 }}>
              {suggestions.map((place) => (
                <View key={place.key} style={styles.suggestionCard} lightColor="#fff8e6" darkColor="#2a2410">
                  <Text style={styles.suggestionText}>
                    Tu es retourné·e {place.visitCount} fois à {place.city}
                    {place.country ? `, ${place.country}` : ''} — probablement ton domicile, ton travail ou de la
                    famille. Le masquer pour tes amis ?
                  </Text>
                  <View style={styles.suggestionActions}>
                    <Pressable style={[styles.suggestionButton, { backgroundColor: tint }]} onPress={() => acceptSuggestion(place)}>
                      <Text style={styles.suggestionButtonText}>Masquer ce lieu</Text>
                    </Pressable>
                    <Pressable style={styles.suggestionDismiss} onPress={() => dismissSuggestion(place)}>
                      <Text style={styles.suggestionDismissText}>Ignorer</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.stayCard} lightColor="#fff" darkColor="#1c1c1e">
            <View style={styles.stayHeader}>
              <Text style={styles.stayCity}>
                {item.city}
                {item.country ? `, ${item.country}` : ''}
              </Text>
              {item.is_hidden ? (
                <View style={styles.hiddenBadge}>
                  <Text style={styles.hiddenBadgeText}>Masqué</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.stayDates}>{formatDateRange(item.start_date, item.end_date)}</Text>
            <Text style={styles.staySource}>
              {item.source === 'photos'
                ? `Depuis tes photos${item.photo_count ? ` (${item.photo_count})` : ''}`
                : 'Ajouté manuellement'}
            </Text>
            <Pressable style={styles.toggleHidden} onPress={() => toggleStayHidden(item)}>
              <Text style={{ color: tint, fontWeight: '600', fontSize: 13 }}>
                {item.is_hidden ? 'Rendre visible à tes amis' : 'Masquer ce lieu à tes amis'}
              </Text>
            </Pressable>
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
  stayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stayCity: { fontSize: 17, fontWeight: '700' },
  stayDates: { opacity: 0.7 },
  staySource: { opacity: 0.5, fontSize: 12, marginTop: 4 },
  toggleHidden: { marginTop: 6 },
  hiddenBadge: { backgroundColor: '#8883', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  hiddenBadgeText: { fontSize: 11, fontWeight: '700', opacity: 0.7 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { opacity: 0.6, textAlign: 'center' },
  suggestionCard: { borderRadius: 12, padding: 12, gap: 8 },
  suggestionText: { fontSize: 13, lineHeight: 18 },
  suggestionActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  suggestionButton: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  suggestionButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  suggestionDismiss: { paddingVertical: 7, paddingHorizontal: 4 },
  suggestionDismissText: { opacity: 0.6, fontWeight: '600', fontSize: 13 },
});
