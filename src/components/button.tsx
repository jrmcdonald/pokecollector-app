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
        : colors.surface;
  const foreground = variant === 'secondary' ? colors.text : colors.onAccent;
  const inactive = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy }}
      disabled={inactive}
      style={(state) => [
        styles.base,
        { backgroundColor: background, opacity: inactive ? 0.5 : state.pressed ? 0.8 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <ThemedText variant="label" style={{ color: foreground }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTapTarget,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
