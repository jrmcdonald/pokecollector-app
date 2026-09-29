import { StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { radius, useColors } from '@/theme';
import { roundedRectPath, type Rect as Box, type Size } from '@/utils/crop';

/**
 * Dims everything but the card-shaped guide, with the same rounded corners
 * as its outline. Purely visual: the crop uses the same `guideRect`, so what
 * is inside the outline is what gets uploaded (plus a small margin). With
 * auto-capture on, the outline turns yellow and thicker while a card found in
 * it is held still: that, and the hint above it, say a photo is coming.
 */
export function GuideOverlay({
  view,
  guide,
  active,
  found = false,
}: {
  view: Size;
  guide: Box;
  active: boolean;
  found?: boolean;
}) {
  const colors = useColors();
  const r = radius.md + 2;
  const shade = `M0,0 H${view.width} V${view.height} H0 Z ${roundedRectPath(guide, r)}`;
  return (
    <Svg
      pointerEvents="none"
      width={view.width}
      height={view.height}
      style={StyleSheet.absoluteFill}>
      <Path d={shade} fill="rgba(13, 15, 20, 0.62)" fillRule="evenodd" />
      <Rect
        x={guide.x}
        y={guide.y}
        width={guide.width}
        height={guide.height}
        rx={r}
        ry={r}
        fill="none"
        stroke={!active ? colors.textSecondary : found ? colors.accent : colors.holo}
        strokeWidth={found && active ? 4 : 2}
      />
    </Svg>
  );
}
