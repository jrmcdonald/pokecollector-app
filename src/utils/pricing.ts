/**
 * Card values, the way upstream computes them (services/card_values.py,
 * `effective_price_quote`, as of 1.59.0), so the app's totals agree with the
 * web UI's.
 *
 * Cardmarket first, in euros. The `*_holo` fields are Cardmarket's
 * reverse-holo listing, not every card with a holo finish, and a zero means
 * "no price" rather than worthless.
 *
 * Since 1.58.4, a card Cardmarket has no price for falls back to TCGplayer's
 * market price for the matching variant, in dollars, converted with the rate
 * upstream saved when it synced the card. Only English cards, and German
 * ones when the server allows it (`tcgplayer_fallback_allowed`): the price
 * is the English market's. An older server sends none of those fields, so a
 * card there is valued from Cardmarket alone, as before.
 */
import type { Card } from '@/api/schemas';

type PriceFields = Partial<
  Pick<
    Card,
    | 'lang'
    | 'price_trend'
    | 'price_market'
    | 'price_trend_holo'
    | 'price_market_holo'
    | 'price_tcg_normal_market'
    | 'price_tcg_holo_market'
    | 'price_tcg_reverse_market'
    | 'price_tcg_first_edition_market'
    | 'price_tcg_usd_to_eur'
    | 'tcgplayer_fallback_allowed'
    | 'variants_normal'
    | 'variants_holo'
  >
>;

export type PriceQuote =
  | { amount: number; source: 'cardmarket' }
  | { amount: number; source: 'tcgplayer'; usd: number; usdToEur: number }
  | { amount: 0; source: null };

const NONE: PriceQuote = { amount: 0, source: null };

/** A usable price: a finite number above zero. Anything else is "none". */
function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

const TCGPLAYER_FIELD = {
  Normal: 'price_tcg_normal_market',
  Holo: 'price_tcg_holo_market',
  'Reverse Holo': 'price_tcg_reverse_market',
  'First Edition': 'price_tcg_first_edition_market',
} as const satisfies Record<string, keyof PriceFields>;

function cardmarket(card: PriceFields, variant: string | null | undefined): number | null {
  const candidates =
    variant === 'Reverse Holo'
      ? [card.price_trend_holo, card.price_trend, card.price_market_holo, card.price_market]
      : [card.price_trend, card.price_market];
  for (const candidate of candidates) {
    const price = positive(candidate);
    if (price !== null) return price;
  }
  return null;
}

/**
 * One copy's value in this variant, and where it came from. With no variant
 * (a wishlist card, a search result), Cardmarket's base price, or for
 * TCGplayer the Holo price when the card is printed holo and never normal,
 * else Normal, as upstream picks.
 */
export function priceQuote(
  card: PriceFields | null | undefined,
  variant?: string | null,
): PriceQuote {
  if (!card) return NONE;
  const euros = cardmarket(card, variant);
  if (euros !== null) return { amount: euros, source: 'cardmarket' };

  const lang = card.lang;
  if (lang !== 'en' && !(lang === 'de' && card.tcgplayer_fallback_allowed === true)) return NONE;
  const printing =
    variant ?? (card.variants_holo && card.variants_normal === false ? 'Holo' : 'Normal');
  const field = TCGPLAYER_FIELD[printing as keyof typeof TCGPLAYER_FIELD];
  if (!field) return NONE;
  const usd = positive(card[field]);
  const usdToEur = positive(card.price_tcg_usd_to_eur);
  if (usd === null || usdToEur === null) return NONE;
  const amount = usd * usdToEur;
  return Number.isFinite(amount) ? { amount, source: 'tcgplayer', usd, usdToEur } : NONE;
}

/** One copy's value in this variant, or 0 when there is none. */
export function cardValue(card: PriceFields | null | undefined, variant?: string | null): number {
  return priceQuote(card, variant).amount;
}

const euros = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' });
// en-US, not en-GB: Hermes on iOS writes en-GB dollars as "US$4.00", even
// with narrowSymbol, where Node writes "$4.00". en-US is "$4.00" in both.
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const wholeEuros = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** "€24.79"; "–" for no price. */
export function formatPrice(value: number | null | undefined): string {
  return typeof value === 'number' && value > 0 ? euros.format(value) : '–';
}

/**
 * A quote where space is short (a tile, a row): "€3.60", or "≈€3.60" when it
 * is a TCGplayer estimate. `times` multiplies it, for a row's copies.
 */
export function formatQuote(quote: PriceQuote, times = 1): string {
  const text = formatPrice(quote.amount * times);
  return quote.source === 'tcgplayer' ? `≈${text}` : text;
}

/** "TCGplayer, converted from $4.00", or null for a Cardmarket price. */
export function quoteSource(quote: PriceQuote, times = 1): string | null {
  return quote.source === 'tcgplayer'
    ? `TCGplayer, converted from ${dollars.format(quote.usd * times)}`
    : null;
}

/** What VoiceOver reads: "€3.60, a TCGplayer estimate converted from $4.00". */
export function spokenQuote(quote: PriceQuote, times = 1): string {
  const text = formatPrice(quote.amount * times);
  return quote.source === 'tcgplayer'
    ? `${text}, a TCGplayer estimate converted from ${dollars.format(quote.usd * times)}`
    : text;
}

/** "€1,234" for totals, where cents are noise. Zero shows as "€0". */
export function formatTotal(value: number): string {
  return wholeEuros.format(value);
}
