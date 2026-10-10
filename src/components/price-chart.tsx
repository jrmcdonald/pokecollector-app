import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useLargeText } from '@/hooks/use-large-text';
import { spacing, useColors } from '@/theme';
import { formatPrice } from '@/utils/pricing';
import { chartGeometry, formatDay, nearestIndex, type ChartPoint } from '@/utils/price-history';

import { ThemedText } from './themed-text';

const PLOT_HEIGHT = 150;
/** Room around the line for its stroke and the end dot. */
const INSET = 6;
/** The price labels' column, right of the plot. */
const AXIS_WIDTH = 64;

/**
 * A card's price as a line over time: one series, so no legend; the panel's
 * heading names it. The axis prices sit in a column beside the plot and the
 * first and last days under it; once the text is large, the column cannot
 * hold a price, so the plot takes the width and the days and the range's
 * low and high are lines of text under it, free to wrap. Dragging across shows the price on each day, through
 * `onScrub`, as the iOS Stocks app does; letting go shows the latest again.
 * To VoiceOver it is one adjustable element: its label summarises the line,
 * and swiping up or down steps through the days.
 */
export function PriceChart({
  points,
  summary,
  onScrub,
}: {
  points: readonly ChartPoint[];
  /** What VoiceOver reads first: the range, the change, the low and the high. */
  summary: string;
  onScrub(index: number | null): void;
}) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const scrubbing = useRef(false);
  const large = useLargeText();

  const plotWidth = Math.max(width - (large ? 0 : AXIS_WIDTH), 0);
  const geometry = chartGeometry(
    points,
    Math.max(plotWidth - INSET * 2, 0),
    PLOT_HEIGHT - INSET * 2,
  );
  const xs = geometry.xs.map((x) => x + INSET);
  const yOf = (i: number) => (geometry.ys[i] ?? 0) + INSET;
  const last = points.length - 1;
  const shown = active ?? last;
  const withYear =
    points.length > 0 &&
    new Date(points[0]!.time).getUTCFullYear() !== new Date(points[last]!.time).getUTCFullYear();

  const select = (index: number | null) => {
    if (index === active) return;
    if (index !== null) Haptics.selectionAsync().catch(() => undefined);
    setActive(index);
    onScrub(index);
  };
  const touch = (event: GestureResponderEvent) =>
    select(nearestIndex(xs, event.nativeEvent.locationX));
  const release = () => {
    scrubbing.current = false;
    select(null);
  };
  const step = (by: number) => {
    const next = Math.min(Math.max(shown + by, 0), last);
    setActive(next === last ? null : next);
    onScrub(next === last ? null : next);
  };
  // About a dozen swipes cross the whole line, rather than one per day.
  const stride = Math.max(1, Math.round(points.length / 12));
  const point = points[shown];

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.row}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={summary}
          accessibilityValue={
            point ? { text: `${formatDay(point, true)}, ${formatPrice(point.price)}` } : undefined
          }
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) =>
            step(event.nativeEvent.actionName === 'increment' ? stride : -stride)
          }
          style={{ width: plotWidth, height: PLOT_HEIGHT }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={touch}
          onResponderMove={(event) => {
            scrubbing.current = true;
            touch(event);
          }}
          onResponderRelease={release}
          onResponderTerminate={release}
          // A vertical drag that starts on the chart scrolls the page, until
          // a drag across has made it a scrub.
          onResponderTerminationRequest={() => !scrubbing.current}>
          {plotWidth > 0 ? (
            <Svg width={plotWidth} height={PLOT_HEIGHT}>
              {[INSET, PLOT_HEIGHT / 2, PLOT_HEIGHT - INSET].map((y) => (
                <Line
                  key={y}
                  x1={0}
                  x2={plotWidth}
                  y1={y}
                  y2={y}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              ))}
              <Path
                d={geometry.path}
                transform={`translate(${INSET}, ${INSET})`}
                fill="none"
                stroke={colors.accent}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {active !== null ? (
                <Line
                  x1={xs[active] ?? 0}
                  x2={xs[active] ?? 0}
                  y1={0}
                  y2={PLOT_HEIGHT}
                  stroke={colors.textSecondary}
                  strokeWidth={1}
                />
              ) : null}
              {points.length > 0 ? (
                <Circle
                  cx={xs[shown] ?? 0}
                  cy={yOf(shown)}
                  r={4}
                  fill={colors.accent}
                  stroke={colors.surface}
                  strokeWidth={2}
                />
              ) : null}
            </Svg>
          ) : null}
        </View>
        {large ? null : (
          <View
            style={styles.axis}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <ThemedText variant="figureSmall" color="textSecondary" numberOfLines={1}>
              {formatPrice(geometry.top)}
            </ThemedText>
            <ThemedText variant="figureSmall" color="textSecondary" numberOfLines={1}>
              {formatPrice(geometry.bottom)}
            </ThemedText>
          </View>
        )}
      </View>
      {points.length === 0 ? null : large ? (
        <View
          style={styles.below}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <ThemedText variant="caption" color="textSecondary">
            {formatDay(points[0]!, withYear)} to {formatDay(points[last]!, withYear)}
          </ThemedText>
          <ThemedText variant="caption" color="textSecondary">
            Low {formatPrice(Math.min(...points.map((p) => p.price)))}, high{' '}
            {formatPrice(Math.max(...points.map((p) => p.price)))}
          </ThemedText>
        </View>
      ) : (
        <View
          style={[styles.dates, { width: plotWidth }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <ThemedText variant="caption" color="textSecondary">
            {formatDay(points[0]!, withYear)}
          </ThemedText>
          <ThemedText variant="caption" color="textSecondary">
            {formatDay(points[last]!, withYear)}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  axis: {
    width: AXIS_WIDTH,
    height: PLOT_HEIGHT,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingLeft: spacing.xs,
  },
  // Inset as the line is, so each day sits under its end of it.
  dates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingHorizontal: INSET,
  },
  below: { marginTop: spacing.xs, gap: 2 },
});
