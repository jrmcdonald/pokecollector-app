/** Filtering and progress for the Sets screen and a set's checklist. */
import type { CardSet, ChecklistCard } from '@/api/schemas';

/** Owned out of total as 0–1, for a progress bar. 0 when the total is unknown. */
export function completion(owned: number | null | undefined, total: number | null | undefined) {
  if (!total || total <= 0) return 0;
  return Math.min(1, Math.max(0, (owned ?? 0) / total));
}

/**
 * The sets to list: matching the search (name, series or abbreviation),
 * and only those with a card owned when `startedOnly` is set. Upstream
 * already sends them newest first.
 */
export function filterSets(
  sets: readonly CardSet[],
  { query, startedOnly }: { query: string; startedOnly: boolean },
): CardSet[] {
  const q = query.trim().toLocaleLowerCase();
  return sets.filter((set) => {
    if (startedOnly && !(set.owned_count ?? 0)) return false;
    if (!q) return true;
    return [set.name, set.series, set.abbreviation, set.id]
      .filter((v): v is string => !!v)
      .some((v) => v.toLocaleLowerCase().includes(q));
  });
}

export function isOwned(card: ChecklistCard): boolean {
  return !!card.owned || (card.owned_quantity ?? 0) > 0;
}
