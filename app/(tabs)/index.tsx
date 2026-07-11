import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';

import { PostCard } from '@/components/social/PostCard';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { PostWithAuthorAndLikes } from '@/types/database';

type RawPostRow = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  author: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
  likes: { user_id: string }[] | null;
};

export default function FeedScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<PostWithAuthorAndLikes[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('posts')
      .select(
        'id, author_id, content, image_url, created_at, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url), likes(user_id)'
      )
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<RawPostRow[]>();

    if (error) {
      setError(error.message);
      return;
    }

    const mapped: PostWithAuthorAndLikes[] = (data ?? [])
      .filter((row) => row.author)
      .map((row) => ({
        id: row.id,
        author_id: row.author_id,
        content: row.content,
        image_url: row.image_url,
        created_at: row.created_at,
        author: row.author!,
        like_count: row.likes?.length ?? 0,
        liked_by_me: !!user && !!row.likes?.some((like) => like.user_id === user.id),
      }));

    setPosts(mapped);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    loadPosts().finally(() => setLoading(false));
  }, [loadPosts]);

  async function onRefresh() {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }

  async function toggleLike(post: PostWithAuthorAndLikes) {
    if (!user) return;

    // Optimistic update.
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: !p.liked_by_me, like_count: p.like_count + (p.liked_by_me ? -1 : 1) }
          : p
      )
    );

    if (post.liked_by_me) {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id);
    } else {
      await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
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
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 10 }}
          renderItem={({ item }) => <PostCard post={item} onToggleLike={toggleLike} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Aucun post pour le moment</Text>
              <Text style={styles.emptySubtitle}>Sois le premier à publier quelque chose !</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 60, paddingHorizontal: 24 },
  error: { color: '#e33', textAlign: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { opacity: 0.6, textAlign: 'center' },
});
