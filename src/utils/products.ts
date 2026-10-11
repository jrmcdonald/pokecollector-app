/**
 * Sealed products: their totals, labels and the add form's parsing. The
 * totals are worked out as upstream's summary does (`get_products_summary`
 * in api/products.py), from the list the app already has, so the summary
 * costs no request of its own.
 */
import type { Product, ProductStatus } from '@/api/schemas';

/** Upstream's value for a product, or what was paid when it has none. */
function countedValue(product: Product): number {
  return product.computed_current_value ?? product.purchase_price;
}

export interface ProductTotals {
  invested: number;
  value: number;
  pnl: number;
  /** Percent of what was invested; 0 when nothing was. */
  pnlPercent: number;
  count: number;
  needsReview: number;
}

export function productTotals(products: readonly Product[]): ProductTotals {
  let invested = 0;
  let value = 0;
  let needsReview = 0;
  for (const product of products) {
    invested += product.purchase_price;
    value += countedValue(product);
    if (product.lifecycle_status === 'review') needsReview += 1;
  }
  const pnl = value - invested;
  return {
    invested,
    value,
    pnl,
    pnlPercent: invested > 0 ? (pnl / invested) * 100 : 0,
    count: products.length,
    needsReview,
  };
}

/** Newest purchase first; the latest added first within a day. */
export function sortProducts(products: readonly Product[]): Product[] {
  return [...products].sort(
    (a, b) => b.purchase_date.localeCompare(a.purchase_date) || b.id - a.id,
  );
}

const STATUS_LABELS: Record<ProductStatus, string> = {
  sealed: 'Sealed',
  opened: 'Opened',
  sold: 'Sold',
  review: 'Needs review',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as ProductStatus] ?? status;
}

/** Where a product's value comes from, said for its page. */
export function valueSourceNote(product: Product): string {
  switch (product.value_source) {
    case 'manual_current':
      return 'The value you entered.';
    case 'purchase_cost_fallback':
      return 'What you paid, as no value has been entered.';
    case 'manual_sold':
      return 'What it sold for.';
    case 'linked_cards':
      return 'The cards pulled from it at today’s prices, plus what was sold.';
    case 'opened_unlinked':
      return 'No value until the cards pulled from it are linked.';
    case 'needs_review':
      return 'No value until you say whether it was opened or is still sealed.';
    default:
      return '';
  }
}

/** Whether profit or loss means anything yet: upstream leaves it out until it does. */
export function hasPnl(product: Product): boolean {
  return typeof product.pnl === 'number';
}

/** Green for a gain, red for a loss, plain for neither (or under a cent). */
export function pnlColor(pnl: number): 'success' | 'danger' | 'text' {
  if (pnl >= 0.005) return 'success';
  if (pnl <= -0.005) return 'danger';
  return 'text';
}

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/**
 * "+", "−" or nothing, for a figure as it will be shown. Written out rather
 * than Intl's `signDisplay`, which Hermes ignores: on the phone a gain would
 * show no sign at all.
 */
function sign(shown: string, value: number): string {
  if (/^0(\.0+)?$/.test(shown)) return '';
  return value > 0 ? '+' : '−';
}

/** "€59.99"; zero shows as "€0.00", as an amount paid can be nothing. */
export function formatMoney(value: number): string {
  return money.format(value);
}

/** "+€12.40", "−€3.00", "€0.00". */
export function formatSignedMoney(value: number): string {
  const shown = Math.abs(value).toFixed(2);
  return `${sign(shown, value)}${money.format(Number(shown))}`;
}

/** "+12.5%", "−4%", "0%". */
export function formatSignedPercent(value: number): string {
  const shown = percent.format(Math.abs(value));
  return `${sign(shown, value)}${shown}%`;
}

/** "+€12.40 (+26.1%)", or the amount alone when there is no percentage. */
export function formatPnl(pnl: number, percent?: number | null): string {
  return typeof percent === 'number'
    ? `${formatSignedMoney(pnl)} (${formatSignedPercent(percent)})`
    : formatSignedMoney(pnl);
}

/**
 * An amount typed in: "59.99", "59,99" or "€59.99". Null when it is not a
 * finite, non-negative number (upstream refuses those), or empty.
 */
export function parseMoney(text: string): number | null {
  const cleaned = text.trim().replace(/^€\s*/, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** "2026-10-11", in the phone's own time zone. */
export function today(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** A real calendar date written YYYY-MM-DD, and not in the future. */
export function isPurchaseDate(text: string, now: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  const real =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real && text <= today(now);
}

/** "11 Oct 2026" for a YYYY-MM-DD date. */
export function formatDate(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return text;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Upstream takes only a Cardmarket Pokémon product page
 * (`https://www.cardmarket.com/<lang>/Pokemon/Products/<category>/<name>`).
 * Checked here too, so the form says so before saving.
 */
export function isCardmarketProductUrl(text: string): boolean {
  // A regex, not URL: React Native's URL has no hostname or pathname.
  const match = /^https:\/\/(?:www\.)?cardmarket\.com(?::443)?(\/[^?#]*)?(?:[?#].*)?$/i.exec(
    text.trim(),
  );
  const parts = (match?.[1] ?? '').split('/').filter(Boolean);
  return (
    !!match &&
    parts.length >= 5 &&
    parts[1]?.toLowerCase() === 'pokemon' &&
    parts[2]?.toLowerCase() === 'products'
  );
}
