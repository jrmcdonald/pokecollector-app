import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { minTapTarget, radius, spacing, type as typeScale, useColors } from '@/theme';

import { ThemedText } from './themed-text';

type Props = TextInputProps & { label: string; hint?: string };

export function TextField({ label, hint, style, ...rest }: Props) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <ThemedText variant="label">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          typeScale.body,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          style,
        ]}
        {...rest}
      />
      {hint ? (
        <ThemedText variant="caption" color="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  input: {
    minHeight: minTapTarget,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm + 4,
  },
});
