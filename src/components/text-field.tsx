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
        // One line, scrolling sideways: a long token or secret must never
        // wrap and grow the field.
        multiline={false}
        numberOfLines={1}
        style={[
          styles.input,
          typeScale.body,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.outline },
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
    height: minTapTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm + 4,
  },
});
