import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { ConnectionWithProfiles, Profile } from '@/types/database';

type SimpleProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

export default function FriendsScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  const [connections, setConnections] = useState<ConnectionWithProfiles[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SimpleProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('connections')
      .select(
        '*, requester:profiles!connections_requester_id_fkey(id, username, display_name, avatar_url), addressee:profiles!connections_addressee_id_fkey(id, username, display_name, avatar_url)'
      )
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .returns<ConnectionWithProfiles[]>();

    if (error) {
      setError(error.message);
      return;
    }
    setConnections(data ?? []);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    loadConnections().finally(() => setLoading(false));
  }, [loadConnections]);

  async function handleSearch(text: string) {
    setQuery(text);
    if (!user || text.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .ilike('username', `%${text.trim()}%`)
      .neq('id', user.id)
      .limit(20);
    setResults(data ?? []);
    setSearching(false);
  }

  async function sendRequest(targetId: string) {
    if (!user) return;
    setError(null);
    const { error } = await supabase.from('connections').insert({ requester_id: user.id, addressee_id: targetId });
    if (error) {
      setError(error.message);
      return;
    }
    await loadConnections();
  }

  async function respond(connectionId: string, status: 'accepted' | 'declined') {
    const { error } = await supabase
      .from('connections')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', connectionId);
    if (error) {
      setError(error.message);
      return;
    }
    await loadConnections();
  }

  async function remove(connectionId: string) {
    const { error } = await supabase.from('connections').delete().eq('id', connectionId);
    if (error) {
      setError(error.message);
      return;
    }
    await loadConnections();
  }

  if (loading || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const incoming = connections.filter((c) => c.status === 'pending' && c.addressee_id === user.id);
  const outgoing = connections.filter((c) => c.status === 'pending' && c.requester_id === user.id);
  const friends = connections
    .filter((c) => c.status === 'accepted')
    .map((c) => ({ connectionId: c.id, profile: c.requester_id === user.id ? c.addressee : c.requester }));

  function connectionStatusFor(profileId: string) {
    return connections.find((c) => c.requester_id === profileId || c.addressee_id === profileId);
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Rechercher un pseudo…"
        autoCapitalize="none"
        value={query}
        onChangeText={handleSearch}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView contentContainerStyle={{ gap: 20, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        {query.trim().length >= 2 ? (
          <Section title="Résultats">
            {searching ? <ActivityIndicator /> : null}
            {results.map((profile) => {
              const existing = connectionStatusFor(profile.id);
              return (
                <View key={profile.id} style={styles.row} lightColor="#fff" darkColor="#1c1c1e">
                  <View style={styles.nameRow}>
                    <Avatar uri={profile.avatar_url} name={profile.display_name || profile.username} size={32} />
                    <Text style={styles.name}>{profile.display_name || profile.username}</Text>
                  </View>
                  {!existing ? (
                    <Pressable style={[styles.smallButton, { backgroundColor: tint }]} onPress={() => sendRequest(profile.id)}>
                      <Text style={styles.smallButtonText}>Ajouter</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.statusLabel}>
                      {existing.status === 'accepted' ? 'Ami' : existing.status === 'pending' ? 'En attente' : 'Refusé'}
                    </Text>
                  )}
                </View>
              );
            })}
            {!searching && results.length === 0 ? <Text style={styles.emptyText}>Aucun résultat.</Text> : null}
          </Section>
        ) : null}

        {incoming.length > 0 ? (
          <Section title="Demandes reçues">
            {incoming.map((c) => (
              <View key={c.id} style={styles.row} lightColor="#fff" darkColor="#1c1c1e">
                <View style={styles.nameRow}>
                  <Avatar uri={c.requester.avatar_url} name={c.requester.display_name || c.requester.username} size={32} />
                  <Text style={styles.name}>{c.requester.display_name || c.requester.username}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable style={[styles.smallButton, { backgroundColor: tint }]} onPress={() => respond(c.id, 'accepted')}>
                    <Text style={styles.smallButtonText}>Accepter</Text>
                  </Pressable>
                  <Pressable style={styles.smallOutlineButton} onPress={() => respond(c.id, 'declined')}>
                    <Text>Refuser</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Section>
        ) : null}

        {outgoing.length > 0 ? (
          <Section title="Demandes envoyées">
            {outgoing.map((c) => (
              <View key={c.id} style={styles.row} lightColor="#fff" darkColor="#1c1c1e">
                <View style={styles.nameRow}>
                  <Avatar uri={c.addressee.avatar_url} name={c.addressee.display_name || c.addressee.username} size={32} />
                  <Text style={styles.name}>{c.addressee.display_name || c.addressee.username}</Text>
                </View>
                <Pressable style={styles.smallOutlineButton} onPress={() => remove(c.id)}>
                  <Text>Annuler</Text>
                </Pressable>
              </View>
            ))}
          </Section>
        ) : null}

        <Section title="Amis">
          {friends.length === 0 ? <Text style={styles.emptyText}>Pas encore d'amis. Cherche un pseudo ci-dessus.</Text> : null}
          {friends.map(({ connectionId, profile }) => (
            <View key={connectionId} style={styles.row} lightColor="#fff" darkColor="#1c1c1e">
              <View style={styles.nameRow}>
                <Avatar uri={profile.avatar_url} name={profile.display_name || profile.username} size={32} />
                <Text style={styles.name}>{profile.display_name || profile.username}</Text>
              </View>
              <Pressable style={styles.smallOutlineButton} onPress={() => remove(connectionId)}>
                <Text>Retirer</Text>
              </Pressable>
            </View>
          ))}
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: '#e33' },
  sectionTitle: { fontSize: 15, fontWeight: '700', opacity: 0.6, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 12,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  name: { fontWeight: '600', flexShrink: 1 },
  smallButton: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  smallButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  smallOutlineButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  statusLabel: { opacity: 0.5, fontSize: 13 },
  emptyText: { opacity: 0.6 },
});
