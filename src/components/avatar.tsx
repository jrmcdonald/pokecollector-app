import { StyleSheet, View } from 'react-native';

import { fonts, useColors } from '@/theme';
import { initialOf } from '@/utils/initial';

import { ThemedText } from './themed-text';

/** An account's picture: the first letter of its name on the accent color. */
export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  const colors = useColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent },
      ]}>
      <ThemedText
        style={{
          color: colors.onAccent,
          fontFamily: fonts.bold,
          fontSize: size * 0.45,
          lineHeight: size * 0.6,
        }}>
        {initialOf(name)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
