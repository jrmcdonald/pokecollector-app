import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { minTapTarget, radius, spacing, useColors } from '@/theme';

import { ThemedText } from './themed-text';

type Props = {
  value: number;
  onChange(next: number): void;
  /** The lowest value the minus button reaches. 0 means "remove". */
  min?: number;
  max?: number;
  disabled?: boolean;
  label: string;
};

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  disabled = false,
  label,
}: Props) {
  const colors = useColors();
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    Haptics.selectionAsync().catch(() => undefined);
    onChange(next);
  };
  const button = (symbol: string, delta: number, a11y: string, atLimit: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a11y} ${label}`}
      disabled={disabled || atLimit}
      onPress={() => step(delta)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.surfaceSelected,
          opacity: disabled || atLimit ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}>
      <ThemedText variant="heading">{symbol}</ThemedText>
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {button('−', -1, value - 1 <= 0 && min === 0 ? 'Remove one of' : 'Decrease', value <= min)}
      <ThemedText variant="figure" style={styles.value} accessibilityLabel={`${label}: ${value}`}>
        {value}
      </ThemedText>
      {button('+', 1, 'Increase', value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: {
    width: minTapTarget,
    height: minTapTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 32, textAlign: 'center' },
});
