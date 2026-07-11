import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { crossingDistanceLabel, crossingLocationLabel, type TimelineEntry } from '@/lib/crossings';
import { formatDateRange, formatMonthYear } from '@/lib/format';

type Props = {
  entries: TimelineEntry[];
  friendName: string;
};

export function CrossingTimeline({ entries, friendName }: Props) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const nearMissColor = '#e08a3c';

  return (
    <View>
      {entries.map((entry, index) => {
        const { crossing } = entry;
        const isOverlap = crossing.kind === 'overlap';
        const dotColor = isOverlap ? tint : nearMissColor;
        const isLast = index === entries.length - 1;

        return (
          <View key={index} style={styles.row}>
            <View style={styles.railColumn}>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              {!isLast ? <View style={styles.rail} lightColor="#0002" darkColor="#fff2" /> : null}
            </View>

            <View style={styles.cardWrap}>
              <View style={styles.card} lightColor="#fff" darkColor="#1c1c1e">
                <View style={styles.cardHeader}>
                  <Text style={styles.city}>{crossingLocationLabel(crossing)}</Text>
                  <View style={[styles.badge, { backgroundColor: isOverlap ? tint : nearMissColor }]}>
                    <Text style={styles.badgeText}>{isOverlap ? 'Ensemble' : 'Manqué'}</Text>
                  </View>
                </View>

                {isOverlap ? (
                  <Text style={styles.detail}>
                    {formatDateRange(crossing.overlapStart, crossing.overlapEnd)}
                    {crossing.distanceKm != null ? ` · ${crossingDistanceLabel(crossing.distanceKm)}` : ''}
                  </Text>
                ) : (
                  <Text style={styles.detail}>
                    Toi : {formatMonthYear(crossing.myStay.start_date)} · {friendName} : {formatMonthYear(crossing.friendStay.start_date)}
                    {'  '}
                    (manqué de {crossing.dayGap} jour{crossing.dayGap > 1 ? 's' : ''})
                  </Text>
                )}

                <MapLink crossing={crossing} friendName={friendName} tint={tint} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MapLink({ crossing, friendName, tint }: { crossing: TimelineEntry['crossing']; friendName: string; tint: string }) {
  const router = useRouter();
  const { myStay, friendStay } = crossing;

  if (myStay.latitude == null || myStay.longitude == null || friendStay.latitude == null || friendStay.longitude == null) {
    return null;
  }

  return (
    <Pressable
      style={styles.mapLink}
      onPress={() =>
        router.push({
          pathname: '/crossing/map',
          params: {
            myLat: String(myStay.latitude),
            myLng: String(myStay.longitude),
            myLabel: `Toi — ${myStay.city}`,
            friendLat: String(friendStay.latitude),
            friendLng: String(friendStay.longitude),
            friendLabel: `${friendName} — ${friendStay.city}`,
            ...(crossing.distanceKm != null ? { distanceLabel: crossingDistanceLabel(crossing.distanceKm) ?? '' } : {}),
          },
        })
      }
    >
      <Text style={{ color: tint, fontWeight: '600', fontSize: 13 }}>Voir sur la carte →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  railColumn: { width: 22, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  rail: { width: 2, flex: 1, marginTop: 2 },
  cardWrap: { flex: 1, paddingBottom: 14 },
  card: { borderRadius: 12, padding: 12, gap: 4, marginLeft: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  city: { fontWeight: '600', flexShrink: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  detail: { opacity: 0.7, fontSize: 13 },
  mapLink: { marginTop: 4 },
});
