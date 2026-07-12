import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export function SettingsGearButton() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  return (
    <Pressable style={styles.button} onPress={() => router.push('/settings')} hitSlop={8}>
      <SymbolView name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }} tintColor={tint} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { marginRight: 6, padding: 2 },
});
