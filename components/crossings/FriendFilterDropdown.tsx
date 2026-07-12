import { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type FriendOption = { id: string; name: string };

type Props = {
  friends: FriendOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function FriendFilterDropdown({ friends, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  const selectedLabel = selectedId ? friends.find((f) => f.id === selectedId)?.name ?? 'Tous les amis' : 'Tous les amis';

  return (
    <>
      <Pressable style={styles.button} onPress={() => setOpen(true)}>
        <Text style={styles.buttonText}>{selectedLabel}</Text>
        <Text style={[styles.chevron, { color: tint }]}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet} lightColor="#fff" darkColor="#1c1c1e">
            <Option
              label="Tous les amis"
              selected={selectedId === null}
              tint={tint}
              onPress={() => {
                onSelect(null);
                setOpen(false);
              }}
            />
            {friends.map((friend) => (
              <Option
                key={friend.id}
                label={friend.name}
                selected={selectedId === friend.id}
                tint={tint}
                onPress={() => {
                  onSelect(friend.id);
                  setOpen(false);
                }}
              />
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function Option({ label, selected, tint, onPress }: { label: string; selected: boolean; tint: string; onPress: () => void }) {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <Text style={[styles.optionText, selected ? { color: tint, fontWeight: '700' } : null]}>{label}</Text>
      {selected ? <Text style={{ color: tint, fontWeight: '700' }}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  buttonText: { fontWeight: '600', fontSize: 14 },
  chevron: { fontSize: 12, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8, paddingBottom: 24 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  optionText: { fontSize: 15 },
});
