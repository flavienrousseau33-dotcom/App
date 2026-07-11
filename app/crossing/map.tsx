import { useLocalSearchParams } from 'expo-router';
import { createElement } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { generateCrossingMapHtml } from '@/lib/mapHtml';

export default function CrossingMapScreen() {
  const params = useLocalSearchParams<{
    myLat: string;
    myLng: string;
    myLabel: string;
    friendLat: string;
    friendLng: string;
    friendLabel: string;
    distanceLabel?: string;
  }>();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  const myLat = Number(params.myLat);
  const myLng = Number(params.myLng);
  const friendLat = Number(params.friendLat);
  const friendLng = Number(params.friendLng);

  if ([myLat, myLng, friendLat, friendLng].some((n) => Number.isNaN(n))) {
    return (
      <View style={styles.center}>
        <Text>Coordonnées manquantes pour ce croisement.</Text>
      </View>
    );
  }

  const html = generateCrossingMapHtml(
    [
      { latitude: myLat, longitude: myLng, label: params.myLabel ?? 'Toi', color: tint },
      { latitude: friendLat, longitude: friendLng, label: params.friendLabel ?? 'Ami', color: '#e08a3c' },
    ],
    params.distanceLabel
  );

  return (
    <View style={styles.container}>
      {Platform.OS === 'web'
        ? // react-native-webview has no web implementation; a plain iframe
          // gives the same result in a browser.
          createElement('iframe', { srcDoc: html, style: { border: 0, width: '100%', height: '100%' } })
        : <WebView originWhitelist={['*']} source={{ html }} style={styles.webview} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
