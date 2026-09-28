import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { minTapTarget, radius, spacing, useColors } from '@/theme';

import { ThemedText } from './themed-text';

type Option<T extends string> = { value: T; label: string };

/**
 * Two or three views of the same list, as one joined control: the iOS
 * segmented control (HIG). Drawn in JavaScript because the native one needs
 * a library, and so an iOS build. Each segment is a radio with its selected
 * state, so VoiceOver reads "Missing, 2 of 3, selected".
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange(next: T): void;
  label: string;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label}, ${index + 1} of ${options.length}`}
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync().catch(() => undefined);
              onChange(option.value);
            }}
            style={[styles.segment, selected && { backgroundColor: colors.accent }]}>
            <ThemedText
              variant="label"
              numberOfLines={1}
              style={{ color: selected ? colors.onAccent : colors.text }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: minTapTarget - 6,
    borderRadius: radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
});
