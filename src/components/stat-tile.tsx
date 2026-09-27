import { StyleSheet } from 'react-native';

import { radius, spacing } from '@/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** A figure with its label underneath, for a row of stats inside a panel. */
export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView
      background="surfaceRaised"
      style={styles.tile}
      accessible
      accessibilityLabel={`${label}: ${value}`}>
      <ThemedText variant="figure" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
      <ThemedText variant="caption" color="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, padding: spacing.sm + 2, borderRadius: radius.md, gap: 2 },
});
