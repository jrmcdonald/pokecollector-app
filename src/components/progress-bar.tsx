import { StyleSheet, View } from 'react-native';

import { useColors } from '@/theme';

/**
 * A thin completion bar. `value` runs from 0 to 1. Teal, turning green when
 * complete: yellow is kept for things that can be tapped.
 */
export function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
  const colors = useColors();
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <View
      // Without `accessible`, iOS does not treat a view as an element at all,
      // whatever its role, and VoiceOver never announces the bar.
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
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
