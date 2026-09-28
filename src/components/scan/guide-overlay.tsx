import { StyleSheet, View } from 'react-native';

import { radius, useColors } from '@/theme';
import type { Rect } from '@/utils/crop';

/**
 * Dims everything but the card-shaped guide, and outlines the guide. Purely
 * visual: the crop uses the same `guideRect`, so what is inside the outline
 * is what gets uploaded (plus a small margin).
 */
export function GuideOverlay({ guide, active }: { guide: Rect; active: boolean }) {
  const colors = useColors();
  const shade = { backgroundColor: 'rgba(13, 15, 20, 0.62)' };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[shade, { height: guide.y }]} />
      <View style={{ flexDirection: 'row', height: guide.height }}>
        <View style={[shade, { width: guide.x }]} />
        <View
          style={[
            styles.frame,
            {
              width: guide.width,
              height: guide.height,
              borderColor: active ? colors.holo : colors.textSecondary,
            },
          ]}
        />
        <View style={[shade, styles.fill]} />
      </View>
      <View style={[shade, styles.fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  frame: { borderWidth: 2, borderRadius: radius.md },
});
