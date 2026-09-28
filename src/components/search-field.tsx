import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { minTapTarget, radius, spacing, type as typeScale, useColors } from '@/theme';

import { Icon } from './icon';

type Props = Omit<TextInputProps, 'onChangeText' | 'value'> & {
  value: string;
  onChangeText(text: string): void;
};

export function SearchField({ value, onChangeText, style, ...rest }: Props) {
  const colors = useColors();
  return (
    <View
      style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.outline }, style]}>
      <Icon name="magnifyingglass" size={16} color="textSecondary" weight="regular" />
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
          <Icon name="xmark.circle.fill" size={18} color="textSecondary" weight="regular" />
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
    borderWidth: 1,
    minHeight: minTapTarget,
    paddingLeft: spacing.sm + 4,
    gap: spacing.sm,
  },
  input: { flex: 1, paddingVertical: spacing.sm },
  clear: {
    width: minTapTarget,
    height: minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
