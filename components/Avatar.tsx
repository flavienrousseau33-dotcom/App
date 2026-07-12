import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

type Props = {
  uri: string | null;
  name: string;
  size?: number;
};

// Same string always maps to the same color, so a given person's initial
// looks consistent across the app even without a real picture.
const PALETTE = ['#2f95dc', '#7a5cd6', '#3aa66b', '#e08a3c', '#d9463f', '#2f78c4'];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % PALETTE.length;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({ uri, name, size = 36 }: Props) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name) },
      ]}
      lightColor={colorFor(name)}
      darkColor={colorFor(name)}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]} lightColor="#fff" darkColor="#fff">
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '700' },
});
