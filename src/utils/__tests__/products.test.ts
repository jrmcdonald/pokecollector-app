import type { Product } from '@/api/schemas';

import {
  formatPnl,
  formatSignedMoney,
  isCardmarketProductUrl,
  isPurchaseDate,
  parseMoney,
  productTotals,
  sortProducts,
  today,
} from '../products';

function product(fields: Partial<Product> & Pick<Product, 'id'>): Product {
  return {
    product_name: 'Booster Box',
    purchase_price: 100,
    purchase_date: '2026-10-01',
    lifecycle_status: 'sealed',
    ...fields,
  };
}

describe('productTotals', () => {
  it("counts upstream's value, or what was paid when there is none, as its summary does", () => {
    const totals = productTotals([
      product({ id: 1, computed_current_value: 130 }),
      product({ id: 2, purchase_price: 50, computed_current_value: null }),
      product({ id: 3, purchase_price: 40, computed_current_value: 0, lifecycle_status: 'review' }),
    ]);
    expect(totals).toEqual({
      invested: 190,
      value: 180,
      pnl: -10,
      pnlPercent: (-10 / 190) * 100,
      count: 3,
      needsReview: 1,
    });
  });

  it('has no percentage when nothing was invested', () => {
    expect(productTotals([]).pnlPercent).toBe(0);
  });
});

describe('sortProducts', () => {
  it('puts the newest purchase first, then the latest added', () => {
    const sorted = sortProducts([
      product({ id: 1, purchase_date: '2026-09-01' }),
      product({ id: 2, purchase_date: '2026-10-01' }),
      product({ id: 3, purchase_date: '2026-10-01' }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual([3, 2, 1]);
  });
});

describe('formatting', () => {
  it('signs profit and loss, with a true minus', () => {
    expect(formatSignedMoney(12.4)).toBe('+€12.40');
    expect(formatSignedMoney(-3)).toBe('−€3.00');
    expect(formatSignedMoney(0)).toBe('€0.00');
    // Rounds to nothing: no sign on a figure that shows as zero.
    expect(formatSignedMoney(0.004)).toBe('€0.00');
    expect(formatSignedMoney(-0.004)).toBe('€0.00');
    expect(formatSignedMoney(1234.5)).toBe('+€1,234.50');
    expect(formatPnl(30, 30)).toBe('+€30.00 (+30%)');
    expect(formatPnl(-10, -5.26)).toBe('−€10.00 (−5.3%)');
    expect(formatPnl(0, 0)).toBe('€0.00 (0%)');
  });
});

describe('parseMoney', () => {
  it('reads amounts as typed', () => {
    expect(parseMoney('59.99')).toBe(59.99);
    expect(parseMoney('59,99')).toBe(59.99);
    expect(parseMoney(' €160 ')).toBe(160);
    expect(parseMoney('0')).toBe(0);
  });

  it('refuses what upstream would', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('12.345')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('dates', () => {
  const now = new Date(2026, 9, 11, 9, 30);

  it("is today's date in the phone's time zone", () => {
    expect(today(now)).toBe('2026-10-11');
  });

  it('takes a real date up to today', () => {
    expect(isPurchaseDate('2026-10-11', now)).toBe(true);
    expect(isPurchaseDate('2024-02-29', now)).toBe(true);
    expect(isPurchaseDate('2026-10-12', now)).toBe(false);
    expect(isPurchaseDate('2025-02-29', now)).toBe(false);
    expect(isPurchaseDate('11/10/2026', now)).toBe(false);
  });
});

describe('isCardmarketProductUrl', () => {
  it('takes a Pokémon product page, as upstream does', () => {
    expect(
      isCardmarketProductUrl(
        'https://www.cardmarket.com/en/Pokemon/Products/Booster-Boxes/Surging-Sparks-Booster-Box',
      ),
    ).toBe(true);
    expect(
      isCardmarketProductUrl('https://cardmarket.com/de/Pokemon/Products/Tins/Some-Tin?language=1'),
    ).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isCardmarketProductUrl('http://www.cardmarket.com/en/Pokemon/Products/A/B')).toBe(false);
    expect(isCardmarketProductUrl('https://www.cardmarket.com/en/Pokemon/Products')).toBe(false);
    expect(isCardmarketProductUrl('https://www.cardmarket.com/en/Magic/Products/A/B')).toBe(false);
    expect(isCardmarketProductUrl('https://evil.example.com/en/Pokemon/Products/A/B')).toBe(false);
    expect(
      isCardmarketProductUrl('https://cardmarket.com.example.com/en/Pokemon/Products/A/B'),
    ).toBe(false);
  });
});
