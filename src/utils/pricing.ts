/**
 * Card values, the way upstream computes them (services/card_values.py), so
 * the app's totals agree with the web UI's.
 *
 * Prices are Cardmarket's, in euros. The `*_holo` fields are Cardmarket's
 * reverse-holo listing, not every card with a holo finish, and a zero means
 * "no price" rather than worthless.
 */
import type { Card } from '@/api/schemas';

type PriceFields = Pick<
  Card,
  'price_trend' | 'price_market' | 'price_trend_holo' | 'price_market_holo'
>;

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}

/** The trend price for one copy in this variant, or 0 when there is none. */
export function cardValue(card: PriceFields | null | undefined, variant?: string | null): number {
  if (!card) return 0;
  const candidates =
    variant === 'Reverse Holo'
      ? [card.price_trend_holo, card.price_trend, card.price_market_holo, card.price_market]
      : [card.price_trend, card.price_market];
  for (const candidate of candidates) {
    const price = positive(candidate);
    if (price !== null) return price;
  }
  return 0;
}

const euros = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' });
const wholeEuros = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** "€24.79"; "–" for no price. */
export function formatPrice(value: number | null | undefined): string {
  return typeof value === 'number' && value > 0 ? euros.format(value) : '–';
}

/** "€1,234" for totals, where cents are noise. Zero shows as "€0". */
export function formatTotal(value: number): string {
  return wholeEuros.format(value);
}
