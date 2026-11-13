import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { minTapTarget, spacing, useColors } from '@/theme';

import { Icon } from './icon';
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
  /**
   * An action rather than a place: no chevron. `destructive` draws the title
   * in red, as iOS does for Sign Out and similar rows.
   */
  kind?: 'navigate' | 'action' | 'destructive';
  /** For a row that is one of a set of choices: whether it is the chosen one. */
  selected?: boolean;
  accessibilityLabel?: string;
};

/** A tappable row, for lists of sets, binders, menus and settings. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  footer,
  onPress,
  kind = 'navigate',
  selected,
  accessibilityLabel,
}: Props) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.surface },
      ]}>
      {leading}
      <View style={styles.body}>
        <View style={styles.line}>
          <View style={styles.text}>
            <ThemedText
              variant="label"
              numberOfLines={1}
              style={[styles.title, kind === 'destructive' && { color: colors.danger }]}>
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {trailing}
          {onPress && kind === 'navigate' ? (
            <Icon name="chevron.right" size={14} color="textSecondary" />
          ) : null}
        </View>
        {footer}
      </View>
    </Pressable>
  );
}

/**
 * A setting that is on or off, as iOS Settings draws one: the text, then a
 * switch. The whole row is the control, so VoiceOver reads one element
 * ("Holo shimmer, switch, off") and a tap anywhere on it flips it.
 */
export function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.surface },
      ]}>
      <View style={[styles.text, disabled && styles.disabled]}>
        <ThemedText variant="label" style={styles.title}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="caption" color="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        // The row speaks for it; a second element would read the same twice.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        trackColor={{ false: colors.outline, true: colors.accent }}
        ios_backgroundColor={colors.outline}
      />
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
  disabled: { opacity: 0.5 },
});
