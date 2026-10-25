import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { minTapTarget, radius, spacing, useColors } from '@/theme';

import { ThemedText } from './themed-text';

type Option<T extends string> = {
  value: T;
  label: string;
  /** A colour to show beside the label, for a choice of colour; the label names it. */
  swatch?: string;
};

/** A single choice from a short list, as a scrollable row of chips. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Option<T>[];
  value: T | null;
  onChange(next: T): void;
  label: string;
}) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onChange(option.value);
            }}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.accent : colors.surface,
                borderColor: selected ? colors.accent : colors.outline,
              },
            ]}>
            {option.swatch ? (
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: option.swatch, borderColor: colors.border },
                ]}
              />
            ) : null}
            <ThemedText variant="label" style={{ color: selected ? colors.onAccent : colors.text }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * A chip that turns something on or off by itself, so several can be on at
 * once, unlike `Chips`' one choice. A switch to VoiceOver, as the Scan tab's
 * Auto pill is.
 */
export function ToggleChip({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange(next: boolean): void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onChange(!value);
      }}
      style={[
        styles.chip,
        styles.toggle,
        {
          backgroundColor: value ? colors.accent : colors.surface,
          borderColor: value ? colors.accent : colors.outline,
        },
      ]}>
      <ThemedText
        variant="label"
        numberOfLines={1}
        style={[styles.toggleLabel, { color: value ? colors.onAccent : colors.text }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    minHeight: minTapTarget - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  // In a wrapping row rather than a scrolling one, cut short only when a
  // chip has the row to itself.
  toggle: { maxWidth: '100%' },
  toggleLabel: { flexShrink: 1 },
});
