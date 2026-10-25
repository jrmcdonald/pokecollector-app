/**
 * Filtering and sorting the collection on the phone.
 *
 * Upstream returns the whole collection in one response, and the app keeps it
 * in the persisted query cache. Doing search, filters and sorting here means
 * changing them costs no requests, which matters under a 60-a-minute limit
 * shared with every other client behind the tunnel.
 */
import type { BinderContents } from '@/api/binders';
import type { DeckContents } from '@/api/decks';
import type { CollectionItem } from '@/api/schemas';

import { isPlanned } from './binders';
import { isRealDeck } from './decks';
import { cardValue } from './pricing';

export type CollectionSort = 'recent' | 'value' | 'name' | 'number';

export const SORT_LABELS: Record<CollectionSort, string> = {
  recent: 'Recently added',
  value: 'Value',
  name: 'Name',
  number: 'Set and number',
};

export interface CollectionFilter {
  query: string;
  setId: string | null;
  rarity: string | null;
  variant: string | null;
  /** Only printings owned more than once: see `duplicatePrintings`. */
  duplicates: boolean;
  /** Only cards with no copy in a collection binder or Real Deck: see `placedCards`. */
  unplaced: boolean;
}

export const NO_FILTER: CollectionFilter = {
  query: '',
  setId: null,
  rarity: null,
  variant: null,
  duplicates: false,
  unplaced: false,
};

/** The filters chosen besides the search text, which is always on show. */
export function activeFilterCount(filter: CollectionFilter): number {
  return [filter.setId, filter.rarity, filter.variant, filter.duplicates, filter.unplaced].filter(
    Boolean,
  ).length;
}

export function hasCollectionFilter(filter: CollectionFilter): boolean {
  return activeFilterCount(filter) > 0 || filter.query.trim().length > 0;
}

/**
 * The cards that have a copy put somewhere: in a collection binder or a Real
 * Deck. Planned binders and decks list cards to collect, not copies, so a
 * card only they list is still loose.
 */
export function placedCards(
  binders: readonly BinderContents[],
  decks: readonly DeckContents[],
): Set<string> {
  const placed = new Set<string>();
  for (const list of [...binders.filter((b) => !isPlanned(b)), ...decks.filter(isRealDeck)]) {
    for (const [cardId, copies] of Object.entries(list.cards)) {
      if (copies > 0) placed.add(cardId);
    }
  }
  return placed;
}

const printing = (item: CollectionItem) => `${item.card_id}|${item.variant ?? 'Normal'}`;

/**
 * The printings (a card in one variant) owned more than once, across every
 * entry: two Near Mint and one Played copy are duplicates, but a Normal and
 * a Reverse Holo copy are two different cards to a collector.
 */
export function duplicatePrintings(items: readonly CollectionItem[]): Set<string> {
  const copies = new Map<string, number>();
  for (const item of items) {
    copies.set(printing(item), (copies.get(printing(item)) ?? 0) + item.quantity);
  }
  return new Set([...copies].filter(([, n]) => n > 1).map(([key]) => key));
}

export function setIdOf(item: CollectionItem): string | null {
  return item.card?.set_ref?.id ?? item.card?.set_id ?? null;
}

export function setNameOf(item: CollectionItem): string | null {
  return item.card?.set_ref?.name ?? item.card?.set_id ?? null;
}

/**
 * `placed` is `placedCards`, needed only to show what is not in a binder or
 * deck; without it, that shows everything.
 */
export function filterCollection(
  items: readonly CollectionItem[],
  filter: CollectionFilter,
  placed?: ReadonlySet<string>,
): CollectionItem[] {
  const needle = filter.query.trim().toLocaleLowerCase();
  // Over every entry: a printing's copies are split across entries by condition.
  const duplicates = filter.duplicates ? duplicatePrintings(items) : null;
  return items.filter((item) => {
    if (duplicates && !duplicates.has(printing(item))) return false;
    if (filter.unplaced && placed?.has(item.card_id)) return false;
    if (filter.setId && setIdOf(item) !== filter.setId) return false;
    if (filter.rarity && item.card?.rarity !== filter.rarity) return false;
    if (filter.variant && (item.variant ?? 'Normal') !== filter.variant) return false;
    if (!needle) return true;
    const haystack = [item.card?.name, setNameOf(item), item.card?.number, item.card?.artist]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Collector numbers are strings like "7", "045", "TG12", "SV-P 031" or
 * "SM109". Comparing them as text puts "10" before "9"; comparing the digit
 * runs as numbers does not.
 */
export function compareCollectorNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortCollection(
  items: readonly CollectionItem[],
  sort: CollectionSort,
): CollectionItem[] {
  const sorted = [...items];
  const byName = (a: CollectionItem, b: CollectionItem) =>
    (a.card?.name ?? '').localeCompare(b.card?.name ?? '', undefined, { sensitivity: 'base' });
  switch (sort) {
    case 'recent':
      // ISO timestamps sort as text; missing dates go last.
      return sorted.sort((a, b) => (b.added_at ?? '').localeCompare(a.added_at ?? ''));
    case 'value':
      return sorted.sort(
        (a, b) =>
          cardValue(b.card, b.variant) * b.quantity - cardValue(a.card, a.variant) * a.quantity ||
          byName(a, b),
      );
    case 'name':
      return sorted.sort(byName);
    case 'number':
      return sorted.sort(
        (a, b) =>
          (setNameOf(a) ?? '').localeCompare(setNameOf(b) ?? '') ||
          compareCollectorNumbers(a.card?.number ?? '', b.card?.number ?? '') ||
          byName(a, b),
      );
  }
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/** The sets, rarities and variants actually present, for the filter pickers. */
export function filterOptions(items: readonly CollectionItem[]): {
  sets: FilterOption[];
  rarities: FilterOption[];
  variants: FilterOption[];
} {
  const tally = (key: (item: CollectionItem) => [string, string] | null) => {
    const counts = new Map<string, FilterOption>();
    for (const item of items) {
      const entry = key(item);
      if (!entry) continue;
      const [value, label] = entry;
      const existing = counts.get(value);
      if (existing) existing.count += item.quantity;
      else counts.set(value, { value, label, count: item.quantity });
    }
    return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
  };
  return {
    sets: tally((item) => {
      const id = setIdOf(item);
      return id ? [id, setNameOf(item) ?? id] : null;
    }),
    rarities: tally((item) => (item.card?.rarity ? [item.card.rarity, item.card.rarity] : null)),
    variants: tally((item) => {
      const variant = item.variant ?? 'Normal';
      return [variant, variant];
    }),
  };
}

/** Every entry for one card: a card can be owned in several variants and conditions. */
export function entriesForCard(
  items: readonly CollectionItem[] | undefined,
  cardId: string,
): CollectionItem[] {
  return (items ?? []).filter((item) => item.card_id === cardId);
}
