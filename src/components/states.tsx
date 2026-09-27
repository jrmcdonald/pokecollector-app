/** What a screen shows instead of content: loading, empty, or failed. */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AccessError, ApiError, AuthError, NetworkError } from '@/api/errors';
import { CARD_ASPECT } from '@/components/card-image';
import { radius, spacing, useColors } from '@/theme';

import { Button } from './button';
import { ThemedText } from './themed-text';

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: { title: string; onPress(): void };
}) {
  return (
    <View style={styles.centered}>
      <ThemedText variant="heading" style={styles.text}>
        {title}
      </ThemedText>
      {message ? (
        <ThemedText color="textSecondary" style={styles.text}>
          {message}
        </ThemedText>
      ) : null}
      {action ? <Button title={action.title} variant="secondary" onPress={action.onPress} /> : null}
    </View>
  );
}

/**
 * A failed load, with the fix that fits: credentials go to Settings,
 * anything else can be retried.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry(): void }) {
  const needsSettings = error instanceof AccessError || error instanceof AuthError;
  const title =
    error instanceof NetworkError
      ? 'Offline or unreachable'
      : needsSettings
        ? 'Not connected'
        : 'Something went wrong';
  const message =
    error instanceof ApiError ? error.message : 'The server sent something unexpected.';
  return (
    <EmptyState
      title={title}
      message={message}
      action={
        needsSettings
          ? { title: 'Open Settings', onPress: () => router.push('/settings') }
          : { title: 'Try again', onPress: onRetry }
      }
    />
  );
}

/** Grey card-shaped blocks while a grid loads. */
export function GridSkeleton({ columns = 3, rows = 3 }: { columns?: number; rows?: number }) {
  const colors = useColors();
  return (
    <View style={styles.grid} accessibilityLabel="Loading">
      {Array.from({ length: rows * columns }, (_, i) => (
        <View key={i} style={[styles.cell, { width: `${100 / columns}%` }]}>
          <View style={[styles.block, { backgroundColor: colors.surface }]} />
          <View style={[styles.line, { backgroundColor: colors.surface }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  text: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm },
  cell: { padding: spacing.xs },
  block: { aspectRatio: CARD_ASPECT, borderRadius: radius.sm },
  line: { height: 10, marginTop: spacing.xs, borderRadius: 4, width: '70%' },
});
