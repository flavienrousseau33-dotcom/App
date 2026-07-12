import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { crossingDistanceLabel } from '@/lib/crossings';
import type { NearMissCrossing } from '@/types/database';

type Props = {
  totalOverlaps: number;
  totalNearMisses: number;
  closestNearMiss: { friendName: string; crossing: NearMissCrossing } | null;
};

export function CrossingStats({ totalOverlaps, totalNearMisses, closestNearMiss }: Props) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const nearMissColor = '#e08a3c';

  if (totalOverlaps === 0 && totalNearMisses === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        <View style={styles.statCard} lightColor="#fff" darkColor="#1c1c1e">
          <Text style={[styles.statValue, { color: tint }]}>{totalOverlaps}</Text>
          <Text style={styles.statLabel}>
            Croisement{totalOverlaps > 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.statCard} lightColor="#fff" darkColor="#1c1c1e">
          <Text style={[styles.statValue, { color: nearMissColor }]}>{totalNearMisses}</Text>
          <Text style={styles.statLabel}>Occasion{totalNearMisses > 1 ? 's' : ''} manquée{totalNearMisses > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {closestNearMiss ? (
        <View style={styles.highlight} lightColor="#fff8ef" darkColor="#2a2013">
          <Text style={styles.highlightText}>
            Vous avez failli vous croiser : {closestNearMiss.friendName} était à {closestNearMiss.crossing.friendCity} à{' '}
            {closestNearMiss.crossing.dayGap} jour{closestNearMiss.crossing.dayGap > 1 ? 's' : ''} près de toi
            {closestNearMiss.crossing.distanceKm != null ? ` (${crossingDistanceLabel(closestNearMiss.crossing.distanceKm)})` : ''}.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 12, opacity: 0.7, textAlign: 'center' },
  highlight: { borderRadius: 12, padding: 12 },
  highlightText: { fontSize: 13, lineHeight: 18 },
});
