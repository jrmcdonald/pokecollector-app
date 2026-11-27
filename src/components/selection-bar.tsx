import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, useColors } from '@/theme';

import { Button } from './button';
import { ThemedText } from './themed-text';

/**
 * Under a list while cards are being chosen: how many, and the one action.
 * Disabled until something is chosen.
 */
export function SelectionBar({
  count,
  copies,
  action,
  busy,
  disabled,
  onAction,
}: {
  count: number;
  copies: number;
  action: string;
  busy?: boolean;
  disabled?: boolean;
  onAction(): void;
}) {
  const colors = useColors();
  const summary =
    count === 0
      ? 'Choose cards'
      : copies === count
        ? `${count} chosen`
        : `${count} chosen · ${copies} copies`;
  return (
    <SafeAreaView
      edges={['bottom']}
      style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <View style={styles.row}>
        <ThemedText
          variant="label"
          style={styles.fill}
          accessibilityLiveRegion="polite"
          accessibilityRole="text">
          {summary}
        </ThemedText>
        <Button
          title={action}
          variant="destructive"
          busy={busy}
          disabled={disabled || count === 0}
          onPress={onAction}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  fill: { flex: 1 },
});
