import type { PricePoint } from '@/api/schemas';

import {
  availableRanges,
  chartGeometry,
  defaultRange,
  formatChange,
  formatDay,
  nearestIndex,
  pointsInRange,
  priceSeries,
  summarize,
  type ChartPoint,
} from '../price-history';

/** `count` daily rows ending on 2026-10-10, the price rising a cent a day. */
function daily(count: number): PricePoint[] {
  const end = Date.UTC(2026, 9, 10);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    price_trend: 10 + i / 100,
  }));
}

describe('priceSeries', () => {
  it('plots the trend, or the market price when there is no trend', () => {
    expect(
      priceSeries([
        { date: '2026-10-01', price_trend: 5, price_market: 6 },
        { date: '2026-10-02', price_trend: null, price_market: 7 },
        { date: '2026-10-03', price_trend: 0, price_market: 8 },
      ]).map((p) => p.price),
    ).toEqual([5, 7, 8]);
  });

  it('leaves out days with no price, and keeps the later row for a day', () => {
    const series = priceSeries([
      { date: '2026-10-03', price_trend: 3 },
      { date: '2026-10-01', price_trend: 0, price_market: null },
      { date: '2026-10-02', price_trend: 2 },
      { date: '2026-10-02', price_trend: 2.5 },
      { date: 'not a date', price_trend: 9 },
    ]);
    expect(series.map((p) => [p.date, p.price])).toEqual([
      ['2026-10-02', 2.5],
      ['2026-10-03', 3],
    ]);
  });
});

describe('ranges', () => {
  it('offers only the ranges the history reaches', () => {
    expect(availableRanges([])).toEqual(['1m']);
    expect(availableRanges(priceSeries(daily(20)))).toEqual(['1m']);
    expect(availableRanges(priceSeries(daily(60)))).toEqual(['1m', '3m']);
    expect(availableRanges(priceSeries(daily(200)))).toEqual(['1m', '3m', '1y']);
    expect(availableRanges(priceSeries(daily(400)))).toEqual(['1m', '3m', '1y', 'all']);
  });

  it('starts on three months when there are three', () => {
    expect(defaultRange(['1m'])).toBe('1m');
    expect(defaultRange(['1m', '3m', '1y'])).toBe('3m');
  });

  it('counts back from the latest point', () => {
    const series = priceSeries(daily(400));
    expect(pointsInRange(series, '1m')).toHaveLength(31);
    expect(pointsInRange(series, '3m')).toHaveLength(92);
    expect(pointsInRange(series, 'all')).toHaveLength(400);
    expect(pointsInRange([], '1m')).toEqual([]);
  });
});

describe('summarize', () => {
  it('gives the change over the points, and their low and high', () => {
    const summary = summarize(priceSeries(daily(11)));
    expect(summary?.first.price).toBe(10);
    expect(summary?.change).toBeCloseTo(0.1);
    expect(summary?.changePercent).toBeCloseTo(1);
    expect(summary?.low).toBe(10);
    expect(summary?.high).toBeCloseTo(10.1);
    expect(summarize([])).toBeNull();
  });
});

describe('chartGeometry', () => {
  const at = (date: string, price: number): ChartPoint => ({
    date,
    time: Date.parse(`${date}T00:00:00Z`),
    price,
  });

  it('puts time across and price up, inside the box', () => {
    const g = chartGeometry([at('2026-10-01', 10), at('2026-10-03', 20)], 200, 100);
    expect(g.xs).toEqual([0, 200]);
    expect(g.ys[0]).toBeGreaterThan(g.ys[1] ?? 0);
    for (const y of g.ys) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(100);
    }
    expect(g.path).toMatch(/^M0,\d+(\.\d)? L200,\d+(\.\d)?$/);
    expect(g.top).toBeGreaterThan(20);
    expect(g.bottom).toBeLessThan(10);
  });

  it('draws a flat line, and a single point, in the middle', () => {
    const flat = chartGeometry([at('2026-10-01', 4), at('2026-10-02', 4)], 100, 80);
    for (const y of flat.ys) expect(y).toBeCloseTo(40);
    const one = chartGeometry([at('2026-10-01', 4)], 100, 80);
    expect(one.xs).toEqual([50]);
    expect(one.ys[0]).toBeCloseTo(40);
  });

  it('never puts the bottom of the axis below zero', () => {
    expect(chartGeometry([at('2026-10-01', 0.01), at('2026-10-02', 5)], 100, 80).bottom).toBe(0);
  });
});

describe('nearestIndex', () => {
  it('finds the point nearest across', () => {
    expect(nearestIndex([0, 50, 100], -10)).toBe(0);
    expect(nearestIndex([0, 50, 100], 70)).toBe(1);
    expect(nearestIndex([0, 50, 100], 80)).toBe(2);
  });
});

describe('formatting', () => {
  it('formats days', () => {
    const point = { time: Date.UTC(2026, 2, 12) };
    expect(formatDay(point)).toBe('12 Mar');
    expect(formatDay(point, true)).toBe('12 Mar 2026');
  });

  it('formats changes with a sign', () => {
    expect(formatChange({ change: 4.69, changePercent: 23.31 })).toBe('+€4.69 (+23.3%)');
    expect(formatChange({ change: -0.5, changePercent: -2 })).toBe('−€0.50 (−2.0%)');
    expect(formatChange({ change: 0.001, changePercent: 0.01 })).toBe('No change');
  });
});
