import { StyleSheet } from 'react-native';

import { radius, spacing } from '@/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView
      background="surface"
      style={styles.tile}
      accessible
      accessibilityLabel={`${label}: ${value}`}>
      <ThemedText variant="caption" color="textSecondary">
        {label}
      </ThemedText>
      <ThemedText variant="heading" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: '45%', padding: spacing.md, borderRadius: radius.md, gap: spacing.xs },
});
