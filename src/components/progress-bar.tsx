import { StyleSheet, View } from 'react-native';

import { useColors } from '@/theme';

/**
 * A thin completion bar. `value` runs from 0 to 1. Teal, turning green when
 * complete: yellow is kept for things that can be tapped.
 */
export function ProgressBar({
  value,
  height = 6,
  decorative = false,
}: {
  value: number;
  height?: number;
  /**
   * Hidden from VoiceOver, for a bar next to a summary that already reads
   * the same figures: read twice, and too thin to be a useful element on its
   * own (the accessibility audit flags its hit area).
   */
  decorative?: boolean;
}) {
  const colors = useColors();
  const clamped = Math.min(1, Math.max(0, value));
  const a11y = decorative
    ? ({
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
      } as const)
    : ({
        // Without `accessible`, iOS does not treat a view as an element at
        // all, whatever its role, and VoiceOver never announces the bar.
        accessible: true,
        accessibilityRole: 'progressbar',
        accessibilityValue: { min: 0, max: 100, now: Math.round(clamped * 100) },
      } as const);
  return (
    <View
      {...a11y}
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: colors.surfaceRaised },
      ]}>
      <View
        style={{
          width: `${clamped * 100}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: clamped >= 1 ? colors.success : colors.holo,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
});
