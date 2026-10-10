/**
 * A card's price history as a chart: which price to plot, over which span,
 * and where each point goes.
 *
 * The plotted price is the trend, as on the rest of the card's page, or the
 * market price on a day the trend is missing. A zero means "no price" (see
 * `pricing.ts`), so those days are left out rather than drawn as a crash.
 */
import type { PricePoint } from '@/api/schemas';

export interface ChartPoint {
  /** `YYYY-MM-DD`, as upstream sends it. */
  date: string;
  /** Midnight UTC of `date`, in milliseconds. */
  time: number;
  price: number;
}

export type PriceRange = '1m' | '3m' | '1y' | 'all';

const DAY = 24 * 60 * 60 * 1000;

export const PRICE_RANGES: readonly { value: PriceRange; label: string; days: number | null }[] = [
  { value: '1m', label: '1M', days: 30 },
  { value: '3m', label: '3M', days: 91 },
  { value: '1y', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
];

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}

function parseDay(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** The days with a price, oldest first, one point per day. */
export function priceSeries(history: readonly PricePoint[]): ChartPoint[] {
  const byDay = new Map<number, ChartPoint>();
  for (const row of history) {
    const time = parseDay(row.date);
    const price = positive(row.price_trend) ?? positive(row.price_market);
    if (time === null || price === null) continue;
    // A later row for the same day is the later sync: it wins.
    byDay.set(time, { date: row.date.slice(0, 10), time, price });
  }
  return [...byDay.values()].sort((a, b) => a.time - b.time);
}

/**
 * The ranges worth offering: 1M always, and each longer one only when the
 * history reaches back past the one before it, so no two show the same line.
 */
export function availableRanges(series: readonly ChartPoint[]): PriceRange[] {
  const first = series[0];
  const last = series[series.length - 1];
  const span = first && last ? (last.time - first.time) / DAY : 0;
  const offered: PriceRange[] = [];
  let previous = 0;
  for (const range of PRICE_RANGES) {
    if (offered.length === 0 || span > previous) offered.push(range.value);
    previous = range.days ?? Number.POSITIVE_INFINITY;
  }
  return offered;
}

/** Three months when the history is that long, or all of it when it is shorter. */
export function defaultRange(offered: readonly PriceRange[]): PriceRange {
  return offered.includes('3m') ? '3m' : (offered[offered.length - 1] ?? '1m');
}

/**
 * The points within the range, counted back from the latest one rather than
 * from today, so a card whose prices stopped syncing still shows its line;
 * the dates under the chart say when that was.
 */
export function pointsInRange(series: readonly ChartPoint[], range: PriceRange): ChartPoint[] {
  const days = PRICE_RANGES.find((r) => r.value === range)?.days ?? null;
  const last = series[series.length - 1];
  if (days === null || !last) return [...series];
  const from = last.time - days * DAY;
  return series.filter((point) => point.time >= from);
}

export interface PriceSummary {
  first: ChartPoint;
  last: ChartPoint;
  change: number;
  /** Null when the first price is zero, which `priceSeries` never keeps. */
  changePercent: number | null;
  low: number;
  high: number;
}

export function summarize(points: readonly ChartPoint[]): PriceSummary | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  const prices = points.map((p) => p.price);
  const change = last.price - first.price;
  return {
    first,
    last,
    change,
    changePercent: first.price > 0 ? (change / first.price) * 100 : null,
    low: Math.min(...prices),
    high: Math.max(...prices),
  };
}

export interface ChartGeometry {
  /** Each point's position, in the same order as the points. */
  xs: number[];
  ys: number[];
  /** An SVG path through every point. */
  path: string;
  /** The prices at the top and bottom of the plot, for the axis labels. */
  top: number;
  bottom: number;
}

/**
 * Lays the points out in a `width` × `height` box: time across, price up.
 * The price axis is not from zero: what matters is how the price moved. A
 * little room above and below keeps the line off the edges, and a flat
 * line sits in the middle.
 */
export function chartGeometry(
  points: readonly ChartPoint[],
  width: number,
  height: number,
): ChartGeometry {
  const prices = points.map((p) => p.price);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  const pad = high > low ? (high - low) * 0.1 : Math.max(high * 0.1, 0.01);
  const top = high + pad;
  const bottom = Math.max(low - pad, 0);

  const start = points[0]?.time ?? 0;
  const span = (points[points.length - 1]?.time ?? 0) - start;
  const xs = points.map((p) => (span > 0 ? ((p.time - start) / span) * width : width / 2));
  const ys = points.map((p) => height - ((p.price - bottom) / (top - bottom)) * height);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${round(x)},${round(ys[i] ?? 0)}`).join(' ');
  return { xs, ys, path, top, bottom };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The index of the point nearest across to `x`; `xs` ascends. */
export function nearestIndex(xs: readonly number[], x: number): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs((xs[i] ?? 0) - x) < Math.abs((xs[best] ?? 0) - x)) best = i;
  }
  return best;
}

const dayMonth = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "12 Mar", or "12 Mar 2025" when the year matters. */
export function formatDay(point: Pick<ChartPoint, 'time'>, withYear = false): string {
  return (withYear ? dayMonthYear : dayMonth).format(new Date(point.time));
}

/** "+€4.69 (+23.3%)", "−€0.50 (−2.0%)", or "No change". */
export function formatChange(summary: Pick<PriceSummary, 'change' | 'changePercent'>): string {
  const cents = Math.round(summary.change * 100);
  if (cents === 0) return 'No change';
  const sign = cents > 0 ? '+' : '−';
  const amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(
    Math.abs(cents) / 100,
  );
  const percent =
    summary.changePercent === null
      ? ''
      : ` (${sign}${Math.abs(summary.changePercent).toFixed(1)}%)`;
  return `${sign}${amount}${percent}`;
}
