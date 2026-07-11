import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { PostWithAuthorAndLikes } from '@/types/database';

type Props = {
  post: PostWithAuthorAndLikes;
  onToggleLike: (post: PostWithAuthorAndLikes) => void;
};

export function PostCard({ post, onToggleLike }: Props) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const authorLabel = post.author.display_name || post.author.username;

  return (
    <View style={styles.card} lightColor="#fff" darkColor="#1c1c1e">
      <View style={styles.header}>
        <Image
          source={post.author.avatar_url ? { uri: post.author.avatar_url } : undefined}
          style={styles.avatar}
          contentFit="cover"
        />
        <View style={styles.headerText}>
          <Text style={styles.username}>{authorLabel}</Text>
          <Text style={styles.handle}>@{post.author.username}</Text>
        </View>
      </View>

      <Text style={styles.content}>{post.content}</Text>

      {post.image_url ? (
        <Image source={{ uri: post.image_url }} style={styles.postImage} contentFit="cover" />
      ) : null}

      <Pressable style={styles.likeRow} onPress={() => onToggleLike(post)} hitSlop={8}>
        <Text style={{ color: post.liked_by_me ? tint : undefined, fontWeight: post.liked_by_me ? '700' : '400' }}>
          {post.liked_by_me ? '♥' : '♡'} {post.like_count}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 14,
    marginVertical: 7,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ccc' },
  headerText: { gap: 1 },
  username: { fontWeight: '700', fontSize: 15 },
  handle: { opacity: 0.5, fontSize: 13 },
  content: { fontSize: 15, lineHeight: 20 },
  postImage: { width: '100%', height: 220, borderRadius: 10, backgroundColor: '#ddd' },
  likeRow: { flexDirection: 'row', alignItems: 'center' },
});
