/**
 * Where to buy a card: searches on eBay, Cardmarket and TCGplayer. Links
 * only; the app never reads these sites, so nothing here costs a request
 * to the server or depends on a marketplace's API.
 */
import type { Card } from '@/api/schemas';

export interface Marketplace {
  /** For the action sheet and VoiceOver's Actions rotor. */
  label: string;
  url: string;
}

/**
 * eBay's site for a region (ISO 3166 code), so prices are local and
 * postage sensible. Anywhere else gets ebay.com.
 */
const EBAY_SITES: Record<string, string> = {
  AT: 'www.ebay.at',
  AU: 'www.ebay.com.au',
  BE: 'www.befr.ebay.be',
  CA: 'www.ebay.ca',
  CH: 'www.ebay.ch',
  DE: 'www.ebay.de',
  ES: 'www.ebay.es',
  FR: 'www.ebay.fr',
  GB: 'www.ebay.co.uk',
  IE: 'www.ebay.ie',
  IT: 'www.ebay.it',
  NL: 'www.ebay.nl',
  PL: 'www.ebay.pl',
};

let region: string | null | undefined;

/** The phone's region, from its locale ("en-GB" is GB), or null if it has none. */
export function deviceRegion(): string | null {
  if (region !== undefined) return region;
  try {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
    region = /[-_]([A-Z]{2})(?:[-_]|$)/.exec(locale)?.[1] ?? null;
  } catch {
    region = null;
  }
  return region;
}

type MarketCard = Pick<Card, 'name' | 'number' | 'set_ref' | 'cardmarket_products'>;

/** "PFL", the set's code, as the card's own corner prints it and sellers write it. */
function setCode(card: MarketCard): string | undefined {
  return card.set_ref?.abbreviation ?? undefined;
}

/**
 * "Pikachu ex 057/198": the name and number as printed, which is how most
 * listings are titled. A number with no set size (a promo, "TG05") goes
 * with the set's name instead, to tell it apart from other prints.
 */
export function listingQuery(card: MarketCard): string {
  const total = card.set_ref?.printed_total;
  if (card.number && /^\d+$/.test(card.number) && total && total > 0) {
    return `${card.name} ${card.number}/${total}`;
  }
  return [card.name, card.set_ref?.name, card.number].filter(Boolean).join(' ');
}

export function ebayUrl(card: MarketCard, region: string | null = deviceRegion()): string {
  const site = (region && EBAY_SITES[region.toUpperCase()]) ?? 'www.ebay.com';
  return `https://${site}/sch/i.html?_nkw=${encodeURIComponent(`Pokemon ${listingQuery(card)}`)}`;
}

/**
 * Cardmarket's own page for the card when TCGdex knows its product id,
 * which upstream keeps in `cardmarket_products`; a search otherwise, as
 * upstream's web UI does. The ordinary print's product comes first: a
 * first edition or special foil is a different product.
 */
export function cardmarketUrl(card: MarketCard): string {
  const products = (card.cardmarket_products ?? []).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const { product_id, variant, foil } = row as Record<string, unknown>;
    const id = Number(product_id);
    if (!Number.isInteger(id) || id <= 0) return [];
    const special = Boolean(foil) || /first/i.test(String(variant ?? ''));
    return [{ id, special }];
  });
  const product = products.find((p) => !p.special) ?? products[0];
  if (product) return `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${product.id}`;
  const query = [card.name, setCode(card), card.number].filter(Boolean).join(' ');
  return `https://www.cardmarket.com/en/Pokemon/Products/Singles?searchMode=v2&idCategory=51&searchString=${encodeURIComponent(query)}`;
}

export function tcgplayerUrl(card: MarketCard): string {
  return `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(listingQuery(card))}`;
}

/** Every marketplace, in the order the action sheet lists them. */
export function marketplaces(
  card: MarketCard,
  region: string | null = deviceRegion(),
): Marketplace[] {
  return [
    { label: 'Find on eBay', url: ebayUrl(card, region) },
    { label: 'Find on Cardmarket', url: cardmarketUrl(card) },
    { label: 'Find on TCGplayer', url: tcgplayerUrl(card) },
  ];
}
