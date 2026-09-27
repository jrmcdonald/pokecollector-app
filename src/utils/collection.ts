/**
 * Filtering and sorting the collection on the phone.
 *
 * Upstream returns the whole collection in one response, and the app keeps it
 * in the persisted query cache. Doing search, filters and sorting here means
 * changing them costs no requests, which matters under a 60-a-minute limit
 * shared with every other client behind the tunnel.
 */
import type { CollectionItem } from '@/api/schemas';

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
}

export const NO_FILTER: CollectionFilter = { query: '', setId: null, rarity: null, variant: null };

export function setIdOf(item: CollectionItem): string | null {
  return item.card?.set_ref?.id ?? item.card?.set_id ?? null;
}

export function setNameOf(item: CollectionItem): string | null {
  return item.card?.set_ref?.name ?? item.card?.set_id ?? null;
}

export function filterCollection(
  items: readonly CollectionItem[],
  filter: CollectionFilter,
): CollectionItem[] {
  const needle = filter.query.trim().toLocaleLowerCase();
  return items.filter((item) => {
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
