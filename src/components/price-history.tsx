import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { usePriceHistory } from '@/hooks/queries';
import { radius, spacing, useColors } from '@/theme';
import { formatPrice } from '@/utils/pricing';
import {
  availableRanges,
  defaultRange,
  formatChange,
  formatDay,
  pointsInRange,
  priceSeries,
  PRICE_RANGES,
  summarize,
  type PriceRange,
  type PriceSummary,
} from '@/utils/price-history';

import { Button } from './button';
import { PriceChart } from './price-chart';
import { Segmented } from './segmented';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** "the past 3 months", or "since 12 Mar 2025" for all of it. */
function spanOf(range: PriceRange, summary: PriceSummary): string {
  switch (range) {
    case '1m':
      return 'the past month';
    case '3m':
      return 'the past 3 months';
    case '1y':
      return 'the past year';
    case 'all':
      return `since ${formatDay(summary.first, true)}`;
  }
}

/**
 * The card's trend price over time, from what upstream's price sync has
 * recorded. One request per card, kept for hours: the sync adds a day at a
 * time.
 */
export function PriceHistory({ cardId }: { cardId: string }) {
  const colors = useColors();
  const history = usePriceHistory(cardId);
  const series = priceSeries(history.data ?? []);
  const offered = availableRanges(series);
  const [chosen, setChosen] = useState<PriceRange | null>(null);
  const range = chosen && offered.includes(chosen) ? chosen : defaultRange(offered);
  const points = pointsInRange(series, range);
  const summary = summarize(points);
  const [scrubbed, setScrubbed] = useState<number | null>(null);

  let body;
  if (history.error && !history.data) {
    body = (
      <View style={styles.message}>
        <ThemedText variant="caption" color="textSecondary">
          The price history could not load.
        </ThemedText>
        <Button
          title="Try again"
          variant="secondary"
          busy={history.isFetching}
          onPress={() => history.refetch()}
        />
      </View>
    );
  } else if (!history.data) {
    body = <View style={[styles.placeholder, { backgroundColor: colors.surfaceRaised }]} />;
  } else if (!summary || points.length < 2) {
    body = (
      <ThemedText variant="caption" color="textSecondary">
        {summary
          ? `Only one price so far, ${formatPrice(summary.last.price)} on ${formatDay(summary.last, true)}. The line starts once there are two.`
          : 'No prices recorded yet. PokeCollector records them each time it syncs prices.'}
      </ThemedText>
    );
  } else {
    const point = scrubbed === null ? null : points[scrubbed];
    const up = summary.change > 0.005;
    const down = summary.change < -0.005;
    const change = `${formatChange(summary)} over ${spanOf(range, summary)}`;
    body = (
      <>
        <View
          style={styles.figures}
          accessible
          accessibilityLabel={
            point
              ? `${formatDay(point, true)}: ${formatPrice(point.price)}`
              : `${formatPrice(summary.last.price)}, ${change}`
          }>
          <ThemedText variant="figure">
            {formatPrice(point ? point.price : summary.last.price)}
          </ThemedText>
          {point ? (
            <ThemedText variant="caption" color="textSecondary">
              {formatDay(point, true)}
            </ThemedText>
          ) : (
            <ThemedText
              variant="caption"
              color={up ? 'success' : down ? 'danger' : 'textSecondary'}>
              {up ? '▲ ' : down ? '▼ ' : ''}
              {change}
            </ThemedText>
          )}
        </View>
        <PriceChart
          points={points}
          summary={`Trend price over ${spanOf(range, summary)}: ${formatPrice(summary.first.price)} to ${formatPrice(summary.last.price)}, ${formatChange(summary)}. Low ${formatPrice(summary.low)}, high ${formatPrice(summary.high)}.`}
          onScrub={setScrubbed}
        />
        {offered.length > 1 ? (
          <Segmented<PriceRange>
            label="Price history range"
            options={PRICE_RANGES.filter((r) => offered.includes(r.value))}
            value={range}
            onChange={(next) => {
              setScrubbed(null);
              setChosen(next);
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <ThemedView background="surface" style={[styles.panel, { borderColor: colors.border }]}>
      <ThemedText variant="heading">Price history</ThemedText>
      {body}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  panel: { padding: spacing.md, borderRadius: radius.lg - 2, borderWidth: 1, gap: spacing.sm + 4 },
  figures: { gap: 2 },
  message: { gap: spacing.sm },
  placeholder: { height: 150, borderRadius: radius.sm },
});
