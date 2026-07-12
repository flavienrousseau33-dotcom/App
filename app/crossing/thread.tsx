import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';
import { formatDateRange } from '@/lib/format';
import {
  addThreadComment,
  addThreadPhoto,
  fetchThreadComments,
  fetchThreadOverview,
  fetchThreadPhotos,
  getThreadPhotoUrl,
  likeThread,
  unlikeThread,
} from '@/lib/threads';
import type { ThreadComment, ThreadOverview, ThreadPhoto } from '@/types/database';

export default function CrossingThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  const [overview, setOverview] = useState<ThreadOverview | null>(null);
  const [comments, setComments] = useState<ThreadComment[]>([]);
  const [photoUrls, setPhotoUrls] = useState<{ photo: ThreadPhoto; url: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [togglingLike, setTogglingLike] = useState(false);

  const loadPhotos = useCallback(async () => {
    const photos = await fetchThreadPhotos(id);
    const withUrls = await Promise.all(photos.map(async (photo) => ({ photo, url: await getThreadPhotoUrl(photo.storage_path) })));
    setPhotoUrls(withUrls);
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [ov, cm] = await Promise.all([fetchThreadOverview(id), fetchThreadComments(id)]);
      setOverview(ov);
      setComments(cm);
      await loadPhotos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger ce fil.");
    }
  }, [id, loadPhotos]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleToggleLike() {
    if (!user || !overview || togglingLike) return;
    setTogglingLike(true);
    const wasLiked = overview.liked_by_me;
    setOverview({ ...overview, liked_by_me: !wasLiked, like_count: overview.like_count + (wasLiked ? -1 : 1) });
    try {
      if (wasLiked) await unlikeThread(overview.id, user.id);
      else await likeThread(overview.id, user.id);
    } catch {
      setOverview(overview);
    } finally {
      setTogglingLike(false);
    }
  }

  async function handlePostComment() {
    if (!user || !overview || !commentBody.trim() || posting) return;
    setPosting(true);
    const body = commentBody.trim();
    try {
      await addThreadComment(overview.id, user.id, body);
      setCommentBody('');
      setComments(await fetchThreadComments(overview.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'envoyer ce commentaire.");
    } finally {
      setPosting(false);
    }
  }

  async function handleAddPhoto() {
    if (!user || !overview || uploadingPhoto) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    try {
      await addThreadPhoto(overview.id, user.id, result.assets[0].uri);
      await loadPhotos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'ajouter cette photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!overview) {
    return (
      <View style={styles.center}>
        <Text>{error ?? "Ce fil n'existe pas ou n'est plus accessible."}</Text>
      </View>
    );
  }

  const isOverlap = overview.kind === 'overlap';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 20 }}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View>
        <View style={styles.headerRow}>
          <Text style={styles.city}>
            {overview.city}
            {overview.country ? `, ${overview.country}` : ''}
          </Text>
          <View style={[styles.kindBadge, { backgroundColor: isOverlap ? tint : '#e08a3c' }]}>
            <Text style={styles.kindBadgeText}>{isOverlap ? 'Ensemble' : 'Manqué'}</Text>
          </View>
        </View>
        <Text style={styles.period}>{formatDateRange(overview.period_start, overview.period_end)}</Text>
      </View>

      <View>
        <Text style={styles.sectionLabel}>
          {overview.participants.length} voyageur{overview.participants.length > 1 ? 's' : ''}
        </Text>
        <View style={styles.participants}>
          {overview.participants.map((participant) => (
            <View key={participant.user_id} style={styles.participantChip} lightColor="#f2f2f5" darkColor="#1c1c1e">
              <Avatar uri={participant.avatar_url} name={participant.display_name} size={22} />
              <Text style={styles.participantName}>
                {participant.is_you ? 'Toi' : participant.display_name}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable style={styles.likeRow} onPress={handleToggleLike} disabled={togglingLike}>
        <SymbolView
          name={{
            ios: overview.liked_by_me ? 'heart.fill' : 'heart',
            android: overview.liked_by_me ? 'favorite' : 'favorite_border',
            web: overview.liked_by_me ? 'favorite' : 'favorite_border',
          }}
          tintColor={overview.liked_by_me ? '#e0393f' : Colors[colorScheme].text}
          size={22}
        />
        <Text style={styles.likeCount}>
          {overview.like_count} j'aime{overview.like_count > 1 ? 's' : ''}
        </Text>
      </Pressable>

      <View>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Photos</Text>
          <Pressable onPress={handleAddPhoto} disabled={uploadingPhoto}>
            {uploadingPhoto ? <ActivityIndicator size="small" /> : <Text style={{ color: tint, fontWeight: '600', fontSize: 13 }}>+ Ajouter</Text>}
          </Pressable>
        </View>
        {photoUrls.length === 0 ? (
          <Text style={styles.empty}>Aucune photo partagée sur ce croisement pour l'instant.</Text>
        ) : (
          <FlatList
            data={photoUrls}
            horizontal
            keyExtractor={(item) => item.photo.id}
            contentContainerStyle={{ gap: 8 }}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) =>
              item.url ? <Image source={{ uri: item.url }} style={styles.photo} contentFit="cover" /> : null
            }
          />
        )}
      </View>

      <View>
        <Text style={styles.sectionLabel}>Commentaires</Text>
        {comments.length === 0 ? (
          <Text style={styles.empty}>Sois le premier à commenter ce croisement.</Text>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <Text style={styles.commentAuthor}>{comment.is_you ? 'Toi' : comment.author_name}</Text>
              <Text style={styles.commentBody}>{comment.body}</Text>
            </View>
          ))
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Écrire un commentaire…"
            value={commentBody}
            onChangeText={setCommentBody}
            multiline
          />
          <Pressable
            style={[styles.sendButton, { backgroundColor: tint, opacity: commentBody.trim() ? 1 : 0.4 }]}
            onPress={handlePostComment}
            disabled={!commentBody.trim() || posting}
          >
            {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendButtonText}>Envoyer</Text>}
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#e33' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  city: { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  period: { opacity: 0.6, fontSize: 13, marginTop: 2 },
  kindBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  kindBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sectionLabel: { fontSize: 13, fontWeight: '700', opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  participants: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  participantChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  participantName: { fontSize: 13, fontWeight: '600' },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  likeCount: { fontSize: 14, fontWeight: '600' },
  empty: { opacity: 0.6, fontSize: 13, marginTop: 8 },
  photo: { width: 120, height: 120, borderRadius: 12 },
  commentRow: { marginTop: 10, gap: 2 },
  commentAuthor: { fontWeight: '700', fontSize: 13 },
  commentBody: { fontSize: 14, lineHeight: 19 },
  composer: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'flex-end' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
