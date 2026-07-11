import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { computeCrossings } from '@/lib/crossings';
import { formatDateRange } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Crossing, Profile, Stay } from '@/types/database';

type FriendCrossings = {
  friend: Pick<Profile, 'id' | 'username' | 'display_name'>;
  crossings: Crossing[];
};

export default function CrossingsScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<FriendCrossings[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);

    const { data: connections, error: connError } = await supabase
      .from('connections')
      .select(
        'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, username, display_name), addressee:profiles!connections_addressee_id_fkey(id, username, display_name)'
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .returns<
        {
          requester_id: string;
          addressee_id: string;
          requester: Pick<Profile, 'id' | 'username' | 'display_name'>;
          addressee: Pick<Profile, 'id' | 'username' | 'display_name'>;
        }[]
      >();

    if (connError) {
      setError(connError.message);
      return;
    }

    const { data: myStays, error: staysError } = await supabase.from('stays').select('*').eq('user_id', user.id).returns<Stay[]>();

    if (staysError) {
      setError(staysError.message);
      return;
    }

    const friends = (connections ?? []).map((c) => (c.requester_id === user.id ? c.addressee : c.requester));

    const results: FriendCrossings[] = [];
    for (const friend of friends) {
      const { data: friendStays } = await supabase.from('stays').select('*').eq('user_id', friend.id).returns<Stay[]>();
      const crossings = computeCrossings(myStays ?? [], friendStays ?? []);
      if (crossings.length > 0) {
        results.push({ friend, crossings });
      }
    }

    setGroups(results);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 14, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {groups.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Aucun croisement pour l'instant</Text>
          <Text style={styles.emptySubtitle}>
            Ajoute des amis et renseigne vos séjours pour découvrir où vos chemins se sont croisés.
          </Text>
        </View>
      ) : (
        groups.map(({ friend, crossings }) => (
          <View key={friend.id} style={styles.friendGroup} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.friendName}>{friend.display_name || friend.username}</Text>
            {crossings.map((crossing, index) => (
              <View key={index} style={styles.crossingRow}>
                <Text style={styles.crossingCity}>
                  {crossing.city}
                  {crossing.country ? `, ${crossing.country}` : ''}
                </Text>
                <Text style={styles.crossingDates}>{formatDateRange(crossing.overlapStart, crossing.overlapEnd)}</Text>
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 60, paddingHorizontal: 10 },
  error: { color: '#e33', textAlign: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { opacity: 0.6, textAlign: 'center' },
  friendGroup: { borderRadius: 14, padding: 14, gap: 10 },
  friendName: { fontSize: 17, fontWeight: '700' },
  crossingRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8883', paddingTop: 8, gap: 2 },
  crossingCity: { fontWeight: '600' },
  crossingDates: { opacity: 0.7 },
});
