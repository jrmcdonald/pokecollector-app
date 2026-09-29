import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import type { ScanJob } from '@/api/schemas';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { reviewCount } from '@/hooks/queries';
import { minTapTarget, radius, spacing, useColors } from '@/theme';

/**
 * The way back to scans left for later: how many photos are waiting for
 * review, or that some are still being read. Opens the list of them.
 */
export function ReviewEntry({ jobs }: { jobs: readonly ScanJob[] | undefined }) {
  const colors = useColors();
  const count = reviewCount(jobs);
  const reading = (jobs ?? []).some((job) => (job.active ?? 0) > 0);
  if (count === 0 && !reading) return null;
  const label = count > 0 ? `${count} to review` : 'Reading scans';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        count > 0
          ? `${count} scanned ${count === 1 ? 'card' : 'cards'} to review`
          : 'Scans still being read'
      }
      onPress={() => router.push('/scans')}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.surface, borderColor: colors.holo },
        pressed && styles.pressed,
      ]}>
      <ThemedText variant="label" style={styles.text}>
        {label}
      </ThemedText>
      <Icon name="chevron.right" size={12} color="textSecondary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: minTapTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
  },
  text: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
});
