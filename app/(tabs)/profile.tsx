import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Post, Profile } from '@/types/database';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: profileData }, { data: postsData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('posts').select('*').eq('author_id', user.id).order('created_at', { ascending: false }),
    ]);

    setProfile(profileData ?? null);
    setPosts(postsData ?? []);
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
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Image
              source={profile?.avatar_url ? { uri: profile.avatar_url } : undefined}
              style={styles.avatar}
              contentFit="cover"
            />
            <Text style={styles.displayName}>{profile?.display_name || profile?.username}</Text>
            <Text style={styles.username}>@{profile?.username}</Text>
            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
            <Text style={styles.postCount}>
              {posts.length} publication{posts.length > 1 ? 's' : ''}
            </Text>
            <Pressable style={styles.signOutButton} onPress={signOut}>
              <Text style={styles.signOutText}>Se déconnecter</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.postRow} lightColor="#fff" darkColor="#1c1c1e">
            <Text numberOfLines={3}>{item.content}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>Tu n'as pas encore publié.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  header: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, gap: 4 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#ccc', marginBottom: 8 },
  displayName: { fontSize: 20, fontWeight: '700' },
  username: { opacity: 0.5 },
  bio: { textAlign: 'center', marginTop: 8 },
  postCount: { marginTop: 10, opacity: 0.6, fontSize: 13 },
  signOutButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e33',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  signOutText: { color: '#e33', fontWeight: '600' },
  postRow: { marginHorizontal: 14, marginVertical: 6, padding: 12, borderRadius: 10 },
  emptyText: { opacity: 0.6 },
});
