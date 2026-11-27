import { CardSchema } from '@/api/schemas';

import {
  cardValue,
  formatPrice,
  formatQuote,
  formatTotal,
  priceQuote,
  quoteSource,
  spokenQuote,
} from '../pricing';

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

/**
 * Upstream's backend/tests/test_tcgplayer_valuation.py at v1.59.0, the
 * TcgplayerValuationTests, case for case. The app prices from `price_trend`
 * then `price_market`, as upstream's default `price_trend` preference does,
 * so "Cardmarket wins for every price preference" is checked for those two.
 */
describe('the TCGplayer fallback (upstream 1.58.4)', () => {
  it('values German cards from TCGplayer only when the server allows it', () => {
    for (const lang of ['en', 'de', 'fr', 'ja', null]) {
      for (const allowed of [false, true]) {
        const card = {
          lang,
          price_tcg_normal_market: 4,
          price_tcg_usd_to_eur: 0.9,
          tcgplayer_fallback_allowed: allowed,
        };
        const expected = lang === 'en' || (lang === 'de' && allowed) ? 3.6 : 0;
        expect(cardValue(card, 'Normal')).toBeCloseTo(expected);
        expect(cardValue({ ...card, price_market: 2 }, 'Normal')).toBe(2);
      }
    }
  });

  it('never treats dollars as euros without a usable rate', () => {
    for (const rate of [null, undefined, 0, -1, NaN, Infinity]) {
      expect(
        cardValue({ lang: 'en', price_tcg_normal_market: 4, price_tcg_usd_to_eur: rate }, 'Normal'),
      ).toBe(0);
    }
  });

  it("reads a rate that isn't a number as none, without failing the card", () => {
    for (const rate of [true, 'invalid']) {
      const card = CardSchema.parse({
        id: 'sv1-1_en',
        name: 'Card',
        lang: 'en',
        price_tcg_normal_market: 4,
        price_tcg_usd_to_eur: rate,
        tcgplayer_fallback_allowed: 'yes',
      });
      expect(card.price_tcg_usd_to_eur).toBeNull();
      expect(card.tcgplayer_fallback_allowed).toBe(false);
      expect(cardValue(card, 'Normal')).toBe(0);
    }
  });

  it('does not borrow a price from another edition or finish', () => {
    const card = { lang: 'en', price_tcg_normal_market: 4, price_tcg_usd_to_eur: 0.9 };
    for (const variant of ['First Edition', 'Holo', 'Reverse Holo', 'Unknown']) {
      expect(cardValue(card, variant)).toBe(0);
    }
  });

  it('lets Cardmarket win for the trend and market prices', () => {
    for (const field of ['price_trend', 'price_market'] as const) {
      const card = { [field]: 2, price_tcg_normal_market: 40, price_tcg_usd_to_eur: 0.9 };
      expect(cardValue(card, 'Normal')).toBe(2);
    }
  });

  it('converts the matching variant’s dollar price to euros', () => {
    const card = {
      lang: 'en',
      price_tcg_normal_market: 4.0,
      price_tcg_first_edition_market: 8.0,
      price_tcg_holo_market: 12.0,
      price_tcg_reverse_market: 16.0,
      price_tcg_usd_to_eur: 0.9,
    };
    for (const [variant, expected] of [
      ['Normal', 3.6],
      ['First Edition', 7.2],
      ['Holo', 10.8],
      ['Reverse Holo', 14.4],
    ] as const) {
      expect(cardValue(card, variant)).toBeCloseTo(expected);
    }
  });

  // From TcgplayerPersistenceTests: 2 Normal and 3 First Edition copies.
  it('totals each edition at its own price', () => {
    const card = {
      lang: 'en',
      price_tcg_normal_market: 4,
      price_tcg_first_edition_market: 8,
      price_tcg_usd_to_eur: 0.9,
    };
    expect(2 * cardValue(card, 'Normal') + 3 * cardValue(card, 'First Edition')).toBeCloseTo(28.8);
  });

  it('picks Holo with no variant only for a card printed holo and never normal', () => {
    const card = {
      lang: 'en',
      price_tcg_normal_market: 4,
      price_tcg_holo_market: 12,
      price_tcg_usd_to_eur: 0.9,
    };
    expect(cardValue({ ...card, variants_holo: true, variants_normal: false })).toBeCloseTo(10.8);
    expect(cardValue({ ...card, variants_holo: true, variants_normal: true })).toBeCloseTo(3.6);
    // Unknown is not "never normal", as upstream's `is False`.
    expect(cardValue({ ...card, variants_holo: true, variants_normal: null })).toBeCloseTo(3.6);
    expect(cardValue(card)).toBeCloseTo(3.6);
  });

  it('is Cardmarket alone on a server older than 1.58.4', () => {
    // No TCGplayer fields, no rate, no permission: as before.
    expect(priceQuote({ lang: 'en', price_trend: null, price_market: null })).toEqual({
      amount: 0,
      source: null,
    });
    const card = CardSchema.parse({
      id: 'x_en',
      name: 'X',
      lang: 'en',
      price_tcg_normal_market: 4,
    });
    expect(card).not.toHaveProperty('price_tcg_usd_to_eur');
    expect(cardValue(card, 'Normal')).toBe(0);
  });
});

describe('labelling a TCGplayer price', () => {
  const tcg = priceQuote(
    { lang: 'en', price_tcg_normal_market: 4, price_tcg_usd_to_eur: 0.9 },
    'Normal',
  );
  const cm = priceQuote({ price_trend: 2.5 });

  it('says where it came from', () => {
    expect(tcg).toEqual({ amount: 3.6, source: 'tcgplayer', usd: 4, usdToEur: 0.9 });
    expect(quoteSource(tcg)).toBe('TCGplayer, converted from $4.00');
    expect(quoteSource(tcg, 3)).toBe('TCGplayer, converted from $12.00');
    expect(quoteSource(cm)).toBeNull();
  });

  it('marks it as an estimate where space is short, and says so to VoiceOver', () => {
    expect(formatQuote(tcg)).toBe('≈€3.60');
    expect(formatQuote(tcg, 2)).toBe('≈€7.20');
    expect(formatQuote(cm)).toBe('€2.50');
    expect(formatQuote(priceQuote(null))).toBe('–');
    expect(spokenQuote(tcg)).toBe('€3.60, a TCGplayer estimate converted from $4.00');
    expect(spokenQuote(cm)).toBe('€2.50');
  });
});
