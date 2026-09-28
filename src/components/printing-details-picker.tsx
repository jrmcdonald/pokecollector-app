import * as Haptics from 'expo-haptics';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { usePrintingDetailTags } from '@/hooks/queries';
import { minTapTarget, radius, spacing, useColors } from '@/theme';

import { ThemedText } from './themed-text';

/**
 * Pick any number of the account's printing details ("Stamped", "Error
 * print"), or add a new one, which PokeCollector creates when the copy is
 * saved. Names are compared without regard to case, as upstream does.
 */
export function PrintingDetailsPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange(next: string[]): void;
}) {
  const colors = useColors();
  const tags = usePrintingDetailTags();
  const known = (tags.data ?? []).map((t) => t.name);
  const extra = value.filter((v) => !known.some((k) => k.toLowerCase() === v.toLowerCase()));
  const names = [...known, ...extra];
  const isOn = (name: string) => value.some((v) => v.toLowerCase() === name.toLowerCase());

  function toggle(name: string) {
    Haptics.selectionAsync().catch(() => undefined);
    onChange(
      isOn(name) ? value.filter((v) => v.toLowerCase() !== name.toLowerCase()) : [...value, name],
    );
  }

  function addNew() {
    Alert.prompt('New printing detail', 'For example Stamped, Staff or Error print.', (text) => {
      const name = text?.trim();
      if (name && !isOn(name)) onChange([...value, name.slice(0, 80)]);
    });
  }

  return (
    <View style={styles.container}>
      <ThemedText variant="overline" color="textSecondary">
        Printing details
      </ThemedText>
      <View style={styles.row}>
        {names.map((name) => {
          const on = isOn(name);
          return (
            <Pressable
              key={name}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(name)}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? colors.accent : colors.surface,
                  borderColor: on ? colors.accent : colors.outline,
                },
              ]}>
              <ThemedText variant="label" style={{ color: on ? colors.onAccent : colors.text }}>
                {name}
              </ThemedText>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a new printing detail"
          onPress={addNew}
          style={[styles.chip, styles.dashed, { borderColor: colors.outline }]}>
          <ThemedText variant="label" color="textSecondary">
            + New
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs + 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: minTapTarget - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    justifyContent: 'center',
  },
  dashed: { borderStyle: 'dashed' },
});
