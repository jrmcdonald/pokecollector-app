import { Pressable, StyleSheet } from 'react-native';

import type { SymbolViewProps } from 'expo-symbols';

import { minTapTarget, radius, spacing, useColors } from '@/theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

/**
 * A button that opens a list of choices: the down chevron says so, unlike a
 * chip that switches something directly (HIG Pull-down buttons).
 */
export function FilterButton({
  name,
  label,
  active,
  icon,
  onPress,
}: {
  /** What it filters or sorts by, for VoiceOver. */
  name: string;
  /** What is chosen now, shown on the button. */
  label: string;
  active: boolean;
  icon?: SymbolViewProps['name'];
  onPress(): void;
}) {
  const colors = useColors();
  const tint = active ? 'onAccent' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}: ${active || icon ? label : 'all'}`}
      accessibilityHint="Opens a list of choices"
      onPress={onPress}
      style={[
        styles.filter,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.accent : colors.outline,
        },
      ]}>
      {icon ? <Icon name={icon} size={13} color={tint} /> : null}
      <ThemedText
        variant="label"
        numberOfLines={1}
        style={[styles.filterLabel, { color: colors[tint] }]}>
        {label}
      </ThemedText>
      <Icon name="chevron.down" size={11} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filter: {
    minHeight: minTapTarget - 8,
    maxWidth: '48%',
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  filterLabel: { flexShrink: 1 },
});
