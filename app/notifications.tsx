import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification, NotificationType } from '@/types/database';

const DOT_COLOR: Record<NotificationType, string> = {
  crossing_overlap: '#2f78c4',
  crossing_near_miss: '#e08a3c',
  friend_request: '#7a5cd6',
  friend_accepted: '#3aa66b',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NotificationsScreen() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  async function handlePress(notification: AppNotification) {
    if (!notification.is_read) await markAsRead(notification.id);

    if (notification.type === 'crossing_overlap' || notification.type === 'crossing_near_miss') {
      const threadId = notification.data?.thread_id;
      if (typeof threadId === 'string') {
        router.push({ pathname: '/crossing/thread', params: { id: threadId } });
      } else {
        router.push('/(tabs)/crossings');
      }
    } else {
      router.push('/(tabs)/friends');
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
      {unreadCount > 0 ? (
        <Pressable style={styles.markAllButton} onPress={markAllAsRead}>
          <Text style={{ color: tint, fontWeight: '600', fontSize: 13 }}>Tout marquer comme lu</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 14, gap: 8 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => handlePress(item)}>
            <View
              style={[styles.card, !item.is_read ? styles.cardUnread : null]}
              lightColor="#fff"
              darkColor="#1c1c1e"
            >
              <View style={[styles.dot, { backgroundColor: DOT_COLOR[item.type] }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.date}>{formatDateTime(item.created_at)}</Text>
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptySubtitle}>
              Tu seras prévenu·e ici des nouvelles demandes d'ami et des croisements détectés au fil du temps.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 80, paddingHorizontal: 24 },
  markAllButton: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingTop: 12 },
  card: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 14 },
  cardUnread: { borderWidth: 1, borderColor: '#2f78c440' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  title: { fontWeight: '700', fontSize: 15 },
  body: { fontSize: 13, opacity: 0.8, lineHeight: 18 },
  date: { fontSize: 11, opacity: 0.5, marginTop: 2 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { opacity: 0.6, textAlign: 'center' },
});
