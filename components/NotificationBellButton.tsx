import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useNotifications } from '@/hooks/useNotifications';

export function NotificationBellButton() {
  const { unreadCount } = useNotifications();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  return (
    <Pressable style={styles.button} onPress={() => router.push('/notifications')} hitSlop={8}>
      <SymbolView name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} tintColor={tint} size={22} />
      {unreadCount > 0 ? (
        <View style={styles.badge} lightColor="#e33" darkColor="#e33">
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { marginRight: 16, padding: 2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
