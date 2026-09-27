import { cardValue, formatPrice, formatTotal } from '../pricing';

describe('cardValue', () => {
  it('uses the trend price, falling back to market', () => {
    expect(cardValue({ price_trend: 24.79, price_market: 37.98 })).toBe(24.79);
    expect(cardValue({ price_trend: null, price_market: 37.98 })).toBe(37.98);
  });

  it('treats a zero as no price, as upstream does', () => {
    expect(cardValue({ price_trend: 0, price_market: 5 })).toBe(5);
    expect(cardValue({ price_trend: 0, price_market: 0 })).toBe(0);
  });

  it("prices a reverse holo from Cardmarket's reverse listing first", () => {
    const card = { price_trend: 10, price_trend_holo: 2.3, price_market: 12, price_market_holo: 3 };
    expect(cardValue(card, 'Reverse Holo')).toBe(2.3);
    expect(cardValue({ ...card, price_trend_holo: 0 }, 'Reverse Holo')).toBe(10);
    // A holo finish is not the reverse listing.
    expect(cardValue(card, 'Holo')).toBe(10);
  });

  it('is 0 without a card', () => {
    expect(cardValue(null)).toBe(0);
  });
});

describe('formatting', () => {
  it('shows euros, and a dash for no price', () => {
    expect(formatPrice(24.79)).toBe('€24.79');
    expect(formatPrice(0)).toBe('–');
    expect(formatPrice(null)).toBe('–');
    expect(formatTotal(1234.56)).toBe('€1,235');
    expect(formatTotal(0)).toBe('€0');
  });
});
