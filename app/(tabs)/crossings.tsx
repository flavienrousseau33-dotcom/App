import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { CrossingTimeline } from '@/components/crossings/CrossingTimeline';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { buildCrossingTimeline, computeCrossings } from '@/lib/crossings';
import { supabase } from '@/lib/supabase';
import type { NearMissCrossing, OverlapCrossing, Profile, Stay } from '@/types/database';

type FriendCrossings = {
  friend: Pick<Profile, 'id' | 'username' | 'display_name'>;
  overlaps: OverlapCrossing[];
  nearMisses: NearMissCrossing[];
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
      const { overlaps, nearMisses } = computeCrossings(myStays ?? [], friendStays ?? []);
      if (overlaps.length > 0 || nearMisses.length > 0) {
        results.push({ friend, overlaps, nearMisses });
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
      contentContainerStyle={{ padding: 14, gap: 20 }}
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
        groups.map(({ friend, overlaps, nearMisses }) => {
          const friendName = friend.display_name || friend.username;
          const entries = buildCrossingTimeline(overlaps, nearMisses);
          return (
            <View key={friend.id} style={styles.friendGroup}>
              <Text style={styles.friendName}>{friendName}</Text>
              <CrossingTimeline entries={entries} friendName={friendName} />
            </View>
          );
        })
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
  friendGroup: { gap: 10 },
  friendName: { fontSize: 17, fontWeight: '700' },
});
