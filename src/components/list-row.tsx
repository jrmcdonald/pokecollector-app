import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { minTapTarget, spacing, useColors } from '@/theme';

import { ThemedText } from './themed-text';

type Props = {
  title: string;
  subtitle?: string;
  /** Before the text: an image, avatar or color swatch. */
  leading?: ReactNode;
  /** After the text, before the chevron: a figure or a badge. */
  trailing?: ReactNode;
  /** Under the text, full width: a progress bar. */
  footer?: ReactNode;
  onPress?(): void;
  onLongPress?(): void;
  accessibilityLabel?: string;
};

/** A tappable row with a chevron, for lists of sets, binders and menus. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  footer,
  onPress,
  onLongPress,
  accessibilityLabel,
}: Props) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.surface },
      ]}>
      {leading}
      <View style={styles.body}>
        <View style={styles.line}>
          <View style={styles.text}>
            <ThemedText variant="label" numberOfLines={1} style={styles.title}>
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {trailing}
          {onPress ? (
            <ThemedText color="textSecondary" style={styles.chevron}>
              ›
            </ThemedText>
          ) : null}
        </View>
        {footer}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: minTapTarget + 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 21 },
  chevron: { fontSize: 22, lineHeight: 24 },
});
