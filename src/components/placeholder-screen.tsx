import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** A tab that exists before its feature does. */
export function PlaceholderScreen({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.content}>
        <ThemedText variant="title">{title}</ThemedText>
        <ThemedText color="textSecondary">{description}</ThemedText>
        {children}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
});
