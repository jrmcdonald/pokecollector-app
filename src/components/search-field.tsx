import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { minTapTarget, radius, spacing, type as typeScale, useColors } from '@/theme';

import { ThemedText } from './themed-text';

type Props = Omit<TextInputProps, 'onChangeText' | 'value'> & {
  value: string;
  onChangeText(text: string): void;
};

export function SearchField({ value, onChangeText, style, ...rest }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.box, { backgroundColor: colors.surface }, style]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        returnKeyType="search"
        style={[styles.input, typeScale.body, { color: colors.text }]}
        {...rest}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          style={styles.clear}>
          <ThemedText color="textSecondary">✕</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    minHeight: minTapTarget,
    paddingLeft: spacing.md,
  },
  input: { flex: 1, paddingVertical: spacing.sm },
  clear: {
    width: minTapTarget,
    height: minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
