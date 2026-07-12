import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';
import { ensureFrequentPlacesSaved, syncStaysForSavedPlace } from '@/lib/savedPlaces';
import { supabase } from '@/lib/supabase';
import type { SavedPlace, Stay } from '@/types/database';

export default function SettingsScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  const [loading, setLoading] = useState(true);
  const [home, setHome] = useState<SavedPlace | null>(null);
  const [work, setWork] = useState<SavedPlace | null>(null);
  const [frequent, setFrequent] = useState<SavedPlace[]>([]);

  const [homeAddress, setHomeAddress] = useState('');
  const [homeHidden, setHomeHidden] = useState(true);
  const [workAddress, setWorkAddress] = useState('');
  const [workHidden, setWorkHidden] = useState(false);

  const [savingHome, setSavingHome] = useState(false);
  const [savingWork, setSavingWork] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;

    const { data: stays } = await supabase.from('stays').select('*').eq('user_id', user.id).returns<Stay[]>();
    await ensureFrequentPlacesSaved(user.id, stays ?? []);

    const { data: places, error: placesError } = await supabase
      .from('saved_places')
      .select('*')
      .eq('user_id', user.id)
      .returns<SavedPlace[]>();

    if (placesError) {
      setError(placesError.message);
      return;
    }

    const homePlace = (places ?? []).find((p) => p.kind === 'home') ?? null;
    const workPlace = (places ?? []).find((p) => p.kind === 'work') ?? null;
    setHome(homePlace);
    setWork(workPlace);
    setFrequent((places ?? []).filter((p) => p.kind === 'frequent'));
    setHomeAddress(homePlace?.address ?? '');
    setHomeHidden(homePlace?.is_hidden ?? true);
    setWorkAddress(workPlace?.address ?? '');
    setWorkHidden(workPlace?.is_hidden ?? false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function geocode(address: string) {
    if (!address.trim()) return { latitude: null, longitude: null };
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return { latitude: null, longitude: null };
      const [coords] = await Location.geocodeAsync(address.trim());
      return coords ? { latitude: coords.latitude, longitude: coords.longitude } : { latitude: null, longitude: null };
    } catch {
      return { latitude: null, longitude: null };
    }
  }

  async function saveHomeOrWork(kind: 'home' | 'work') {
    if (!user) return;
    setError(null);
    const isHome = kind === 'home';
    const address = isHome ? homeAddress : workAddress;
    const isHidden = isHome ? homeHidden : workHidden;
    const existing = isHome ? home : work;

    isHome ? setSavingHome(true) : setSavingWork(true);
    try {
      const { latitude, longitude } = await geocode(address);

      const payload = { user_id: user.id, kind, address: address.trim() || null, latitude, longitude, is_hidden: isHidden };

      const { data: saved, error: saveError } = existing
        ? await supabase.from('saved_places').update(payload).eq('id', existing.id).select().single()
        : await supabase.from('saved_places').insert(payload).select().single();

      if (saveError) {
        setError(saveError.message);
        return;
      }

      if (isHome) setHome(saved as SavedPlace);
      else setWork(saved as SavedPlace);

      await syncStaysForSavedPlace(user.id, saved as SavedPlace);
    } finally {
      isHome ? setSavingHome(false) : setSavingWork(false);
    }
  }

  async function toggleFrequent(place: SavedPlace) {
    const updated = { ...place, is_hidden: !place.is_hidden };
    setFrequent((prev) => prev.map((p) => (p.id === place.id ? updated : p)));
    await supabase.from('saved_places').update({ is_hidden: updated.is_hidden }).eq('id', place.id);
    if (user) await syncStaysForSavedPlace(user.id, updated);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 24 }}>
      <Text style={styles.title}>Lieux cachés</Text>
      <Text style={styles.intro}>
        Un lieu masqué devient invisible pour tous tes amis, quelle que soit la distance — jamais pour toi.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section} lightColor="#fff" darkColor="#1c1c1e">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Maison</Text>
          <Switch value={homeHidden} onValueChange={setHomeHidden} trackColor={{ true: tint }} />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Adresse (ex : 12 rue de la République, Lyon)"
          value={homeAddress}
          onChangeText={setHomeAddress}
        />
        <Pressable style={[styles.saveButton, { backgroundColor: tint }]} onPress={() => saveHomeOrWork('home')} disabled={savingHome}>
          {savingHome ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Enregistrer</Text>}
        </Pressable>
      </View>

      <View style={styles.section} lightColor="#fff" darkColor="#1c1c1e">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Travail</Text>
          <Switch value={workHidden} onValueChange={setWorkHidden} trackColor={{ true: tint }} />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Adresse (ex : 5 avenue Foch, Lyon)"
          value={workAddress}
          onChangeText={setWorkAddress}
        />
        <Pressable style={[styles.saveButton, { backgroundColor: tint }]} onPress={() => saveHomeOrWork('work')} disabled={savingWork}>
          {savingWork ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Enregistrer</Text>}
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.sectionTitle}>Lieux fréquents détectés</Text>
        <Text style={styles.intro}>Lieux où tu es retourné·e 3 fois ou plus — probablement familiers, pas de simples voyages.</Text>
        {frequent.length === 0 ? (
          <Text style={styles.empty}>Aucun lieu fréquent détecté pour l'instant.</Text>
        ) : (
          frequent.map((place) => (
            <View key={place.id} style={styles.frequentRow} lightColor="#fff" darkColor="#1c1c1e">
              <Text style={styles.frequentAddress}>{place.address}</Text>
              <Switch value={place.is_hidden} onValueChange={() => toggleFrequent(place)} trackColor={{ true: tint }} />
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  intro: { opacity: 0.6, fontSize: 13, lineHeight: 18 },
  error: { color: '#e33' },
  section: { borderRadius: 14, padding: 14, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  saveButton: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '700' },
  frequentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 12,
  },
  frequentAddress: { fontWeight: '600', flexShrink: 1, marginRight: 8 },
  empty: { opacity: 0.6, fontSize: 13 },
});
