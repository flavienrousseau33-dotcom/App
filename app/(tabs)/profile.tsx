import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stayCount, setStayCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: profileData }, { count: stays }, { count: friends }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('stays').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ]);

    setProfile(profileData ?? null);
    setStayCount(stays ?? 0);
    setFriendCount(friends ?? 0);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={profile?.avatar_url ? { uri: profile.avatar_url } : undefined}
        style={styles.avatar}
        contentFit="cover"
      />
      <Text style={styles.displayName}>{profile?.display_name || profile?.username}</Text>
      <Text style={styles.username}>@{profile?.username}</Text>
      {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{stayCount}</Text>
          <Text style={styles.statLabel}>Séjours</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{friendCount}</Text>
          <Text style={styles.statLabel}>Amis</Text>
        </View>
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 40, paddingHorizontal: 16, gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#ccc', marginBottom: 8 },
  displayName: { fontSize: 20, fontWeight: '700' },
  username: { opacity: 0.5 },
  bio: { textAlign: 'center', marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 32, marginTop: 24 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { opacity: 0.6, fontSize: 13 },
  signOutButton: {
    marginTop: 32,
    borderWidth: 1,
    borderColor: '#e33',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  signOutText: { color: '#e33', fontWeight: '600' },
});
