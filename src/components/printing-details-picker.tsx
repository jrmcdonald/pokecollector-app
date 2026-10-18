import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { usePrintingDetailTags } from '@/hooks/queries';
import { minTapTarget, radius, spacing, useColors } from '@/theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

/**
 * Pick any number of the account's printing details ("Stamped", "Error
 * print"), or add a new one, which PokeCollector creates when the copy is
 * saved. Names are compared without regard to case, as upstream does.
 *
 * Most copies have none, so the chips start folded away under one row that
 * says which are chosen; tapping it opens them.
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
  const [open, setOpen] = useState(false);
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

  const chosen = value.length > 0 ? value.join(', ') : 'None';

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Printing details, ${chosen}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
        <ThemedText variant="label" color="textSecondary">
          Printing details
        </ThemedText>
        <View style={styles.summary}>
          <ThemedText variant="label" numberOfLines={1} style={styles.chosen}>
            {chosen}
          </ThemedText>
          <Icon name={open ? 'chevron.up' : 'chevron.down'} size={12} color="textSecondary" />
        </View>
      </Pressable>
      {open ? (
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
            style={[styles.chip, styles.dashed, styles.newChip, { borderColor: colors.outline }]}>
            <Icon name="plus" size={12} color="textSecondary" weight="bold" />
            <ThemedText variant="label" color="textSecondary">
              New
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs + 2 },
  toggle: {
    minHeight: minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summary: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  chosen: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: minTapTarget - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    justifyContent: 'center',
  },
  dashed: { borderStyle: 'dashed' },
  newChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
