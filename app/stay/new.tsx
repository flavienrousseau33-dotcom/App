import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function NewStayScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!user) return;
    if (!city.trim()) {
      setError('Indique une ville.');
      return;
    }
    if (endDate < startDate) {
      setError('La date de fin doit être après la date de début.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      // Best-effort geocoding so manual stays can also be matched by
      // distance in "Croisements", not just by exact city name. Not fatal
      // if it fails — the stay is still saved without coordinates.
      let latitude: number | null = null;
      let longitude: number | null = null;
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const query = country.trim() ? `${city.trim()}, ${country.trim()}` : city.trim();
          const [coords] = await Location.geocodeAsync(query);
          if (coords) {
            latitude = coords.latitude;
            longitude = coords.longitude;
          }
        }
      } catch {
        // Ignore — geocoding is a nice-to-have here, not a requirement.
      }

      const { error } = await supabase.from('stays').insert({
        user_id: user.id,
        city: city.trim(),
        country: country.trim() || null,
        latitude,
        longitude,
        start_date: toIsoDate(startDate),
        end_date: toIsoDate(endDate),
        source: 'manual',
      });
      if (error) throw error;
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Ville</Text>
      <TextInput style={styles.input} placeholder="Lyon" value={city} onChangeText={setCity} />

      <Text style={styles.label}>Pays (optionnel)</Text>
      <TextInput style={styles.input} placeholder="France" value={country} onChangeText={setCountry} />

      <Text style={styles.label}>Du</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowStartPicker(true)}>
        <Text>{startDate.toLocaleDateString('fr-FR')}</Text>
      </Pressable>
      {showStartPicker ? (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, date) => {
            setShowStartPicker(Platform.OS === 'ios');
            if (event.type !== 'dismissed' && date) setStartDate(date);
          }}
        />
      ) : null}

      <Text style={styles.label}>Au</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowEndPicker(true)}>
        <Text>{endDate.toLocaleDateString('fr-FR')}</Text>
      </Pressable>
      {showEndPicker ? (
        <DateTimePicker
          value={endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, date) => {
            setShowEndPicker(Platform.OS === 'ios');
            if (event.type !== 'dismissed' && date) setEndDate(date);
          }}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.saveButton, { backgroundColor: tint }]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Enregistrer</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 6 },
  label: { fontWeight: '600', marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: { color: '#e33', marginTop: 10 },
  saveButton: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
