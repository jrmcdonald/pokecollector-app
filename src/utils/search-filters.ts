/**
 * Filters for the catalogue search, sent to upstream's `/api/cards/search`.
 *
 * Upstream matches each filter as a case- and accent-insensitive substring
 * (`services/text_search.py`), in the catalogue's own language. The values
 * here are TCGdex's English ones, which is what an English catalogue holds.
 * A substring is right for category and type, but not for rarity: "Rare"
 * also finds "Ultra Rare", and "Common" finds "Uncommon". So the rarity goes
 * upstream to narrow the search, and the phone keeps only exact matches.
 */
import type { SearchCard } from '@/api/schemas';

export type Category = 'Pokemon' | 'Trainer' | 'Energy';

export interface SearchFilter {
  set: { id: string; name: string } | null;
  rarity: string | null;
  category: Category | null;
  /** An energy type, for Pokémon. */
  type: string | null;
}

export const NO_SEARCH_FILTER: SearchFilter = {
  set: null,
  rarity: null,
  category: null,
  type: null,
};

export const CATEGORIES: readonly { value: Category; label: string }[] = [
  { value: 'Pokemon', label: 'Pokémon' },
  { value: 'Trainer', label: 'Trainer' },
  { value: 'Energy', label: 'Energy' },
];

/** In the order the game lists them. */
export const TYPES = [
  'Grass',
  'Fire',
  'Water',
  'Lightning',
  'Psychic',
  'Fighting',
  'Darkness',
  'Metal',
  'Fairy',
  'Dragon',
  'Colorless',
] as const;

/**
 * TCGdex's English rarities, roughly from most to least common, with its own
 * capitalisation ("Double rare"). Not every one: older and Pocket rarities
 * join the list when the collection has a card of them.
 */
export const RARITIES = [
  'Common',
  'Uncommon',
  'Rare',
  'Holo Rare',
  'Double rare',
  'Ultra Rare',
  'Illustration rare',
  'Special illustration rare',
  'Hyper rare',
  'Mega Hyper Rare',
  'ACE SPEC Rare',
  'Shiny rare',
  'Shiny Ultra Rare',
  'Secret Rare',
  'Amazing Rare',
  'Radiant Rare',
  'Holo Rare V',
  'Holo Rare VMAX',
  'Holo Rare VSTAR',
] as const;

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** "Double rare" as "Double Rare", for a button. Leaves "ACE SPEC" alone. */
export function rarityLabel(rarity: string): string {
  return rarity
    .split(' ')
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The rarities to offer: the known ones, then any other the collection has.
 * TCGdex's "None" is left out; it is not something to look for.
 */
export function rarityOptions(owned: readonly (string | null | undefined)[]): string[] {
  const options: string[] = [...RARITIES];
  for (const rarity of owned) {
    if (!rarity || same(rarity, 'None')) continue;
    if (!options.some((o) => same(o, rarity))) options.push(rarity);
  }
  return options;
}

export function hasFilter(filter: SearchFilter): boolean {
  return !!(filter.set || filter.rarity || filter.category || filter.type);
}

/** A type only means something for Pokémon. */
export function typeApplies(filter: SearchFilter): boolean {
  return filter.category === null || filter.category === 'Pokemon';
}

/** What upstream is sent, besides the text, page and page size. */
export function searchQuery(filter: SearchFilter) {
  return {
    set_id: filter.set?.id,
    rarity: filter.rarity ?? undefined,
    category: filter.category ?? undefined,
    type: typeApplies(filter) ? (filter.type ?? undefined) : undefined,
  };
}

/**
 * Whether upstream's substring match on this rarity also finds others, so
 * its total counts cards the phone then leaves out.
 */
export function rarityIsAmbiguous(rarity: string, known: readonly string[]): boolean {
  const needle = rarity.toLocaleLowerCase();
  return known.some((o) => !same(o, rarity) && o.toLocaleLowerCase().includes(needle));
}

/** Results with exactly the chosen rarity, not just one containing it. */
export function exactRarity<T extends Pick<SearchCard, 'rarity'>>(
  cards: readonly T[],
  rarity: string | null,
): T[] {
  if (!rarity) return [...cards];
  return cards.filter((card) => !!card.rarity && same(card.rarity, rarity));
}
