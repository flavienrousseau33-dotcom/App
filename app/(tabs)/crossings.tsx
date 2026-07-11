import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { computeCrossings } from '@/lib/crossings';
import { formatDateRange, formatMonthYear } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { CrossingBase, NearMissCrossing, OverlapCrossing, Profile, Stay } from '@/types/database';

type FriendCrossings = {
  friend: Pick<Profile, 'id' | 'username' | 'display_name'>;
  overlaps: OverlapCrossing[];
  nearMisses: NearMissCrossing[];
};

function locationLabel(crossing: CrossingBase) {
  if (crossing.city.toLowerCase() === crossing.friendCity.toLowerCase()) {
    return crossing.country ? `${crossing.city}, ${crossing.country}` : crossing.city;
  }
  return `${crossing.city} ↔ ${crossing.friendCity}`;
}

function distanceLabel(distanceKm: number | null) {
  if (distanceKm == null) return null;
  if (distanceKm < 1) return "à moins d'1 km";
  return `à ${Math.round(distanceKm)} km`;
}

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
        groups.map(({ friend, overlaps, nearMisses }) => (
          <View key={friend.id} style={styles.friendGroup} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.friendName}>{friend.display_name || friend.username}</Text>

            {overlaps.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Au même endroit, en même temps</Text>
                {overlaps.map((crossing, index) => (
                  <View key={index} style={styles.crossingRow}>
                    <Text style={styles.crossingCity}>{locationLabel(crossing)}</Text>
                    <Text style={styles.crossingDetail}>
                      {formatDateRange(crossing.overlapStart, crossing.overlapEnd)}
                      {crossing.distanceKm != null ? ` · ${distanceLabel(crossing.distanceKm)}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {nearMisses.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Même endroit, dates différentes</Text>
                {nearMisses.map((crossing, index) => (
                  <View key={index} style={styles.crossingRow}>
                    <Text style={styles.crossingCity}>{locationLabel(crossing)}</Text>
                    <Text style={styles.crossingDetail}>
                      Toi : {formatMonthYear(crossing.myStay.start_date)} · Eux : {formatMonthYear(crossing.friendStay.start_date)}
                      {'  '}
                      (manqué de {crossing.dayGap} jour{crossing.dayGap > 1 ? 's' : ''})
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
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
  friendGroup: { borderRadius: 14, padding: 14, gap: 14 },
  friendName: { fontSize: 17, fontWeight: '700' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', opacity: 0.5, textTransform: 'uppercase' },
  crossingRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8883', paddingTop: 8, gap: 2 },
  crossingCity: { fontWeight: '600' },
  crossingDetail: { opacity: 0.7, fontSize: 13 },
});
