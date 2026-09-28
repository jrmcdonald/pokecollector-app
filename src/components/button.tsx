import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { minTapTarget, radius, spacing, useColors } from '@/theme';

import { ThemedText } from './themed-text';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  busy?: boolean;
};

export function Button({
  title,
  variant = 'primary',
  busy = false,
  disabled,
  style,
  ...rest
}: Props) {
  const colors = useColors();
  const background =
    variant === 'primary'
      ? colors.accent
      : variant === 'destructive'
        ? colors.danger
        : colors.surfaceRaised;
  const foreground = variant === 'secondary' ? colors.text : colors.onAccent;
  const inactive = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      // The title is replaced by a spinner while busy; without this the
      // button would have no name for VoiceOver then.
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy }}
      disabled={inactive}
      style={(state) => [
        styles.base,
        {
          backgroundColor: background,
          // A secondary button's fill barely differs from the page, so its
          // outline is what marks it as a button (WCAG 1.4.11).
          borderColor: variant === 'secondary' ? colors.outline : background,
          opacity: inactive ? 0.5 : state.pressed ? 0.8 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <ThemedText variant="label" style={[styles.title, { color: foreground }]}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTapTarget + 4,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, lineHeight: 20 },
});
