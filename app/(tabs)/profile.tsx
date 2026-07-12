import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { removeAvatar, uploadAvatar } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stayCount, setStayCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleChangeAvatar() {
    if (!user || savingAvatar) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;

    setSavingAvatar(true);
    setError(null);
    try {
      const avatarUrl = await uploadAvatar(user.id, result.assets[0].uri);
      setProfile((prev) => (prev ? { ...prev, avatar_url: avatarUrl } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de changer la photo de profil.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!user || !profile?.avatar_url || savingAvatar) return;
    setSavingAvatar(true);
    setError(null);
    try {
      await removeAvatar(user.id, profile.avatar_url);
      setProfile((prev) => (prev ? { ...prev, avatar_url: null } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de retirer la photo de profil.');
    } finally {
      setSavingAvatar(false);
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
      <Pressable onPress={handleChangeAvatar} disabled={savingAvatar} style={styles.avatarWrap}>
        <Avatar uri={profile?.avatar_url ?? null} name={profile?.display_name || profile?.username || '?'} size={84} />
        {savingAvatar ? (
          <View style={styles.avatarOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </Pressable>
      <Pressable onPress={handleChangeAvatar} disabled={savingAvatar}>
        <Text style={styles.changePhotoLink}>Changer la photo</Text>
      </Pressable>
      {profile?.avatar_url ? (
        <Pressable onPress={handleRemoveAvatar} disabled={savingAvatar}>
          <Text style={styles.removePhotoLink}>Retirer la photo</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

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
  avatarWrap: { marginBottom: 4 },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 42,
    backgroundColor: '#0007',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoLink: { color: '#2f95dc', fontWeight: '600', fontSize: 13, marginTop: 8 },
  removePhotoLink: { color: '#e33', fontWeight: '600', fontSize: 13, marginTop: 6 },
  error: { color: '#e33', marginTop: 8, textAlign: 'center' },
  displayName: { fontSize: 20, fontWeight: '700', marginTop: 16 },
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
