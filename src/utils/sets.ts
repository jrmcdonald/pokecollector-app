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

export type ChecklistShow = 'all' | 'missing' | 'owned';

/** Lower case and without accents, so "flabebe" finds Flabébé. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

/** "025", "25" and "25/165" are the same card; "TG12" stays as it is. */
function bareNumber(number: string): string {
  return fold(number.split('/')[0]?.trim() ?? '').replace(/^0+(?=\d)/, '');
}

/** A card matches by name, anywhere in it, or by its number, exactly. */
export function matchesCard(card: Pick<ChecklistCard, 'name' | 'number'>, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (fold(card.name).includes(fold(q))) return true;
  return !!card.number && bareNumber(card.number) === bareNumber(q);
}

/** A set's cards to show, in the checklist's own (number) order. */
export function filterChecklist(
  cards: readonly ChecklistCard[],
  { show, query, rarity }: { show: ChecklistShow; query: string; rarity: string | null },
): ChecklistCard[] {
  return cards.filter((card) => {
    if (show === 'owned' && !isOwned(card)) return false;
    if (show === 'missing' && isOwned(card)) return false;
    if (rarity && card.rarity !== rarity) return false;
    return matchesCard(card, query);
  });
}

/** The set's rarities with how many cards each, in the order they first appear. */
export function checklistRarities(
  cards: readonly ChecklistCard[],
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (card.rarity) counts.set(card.rarity, (counts.get(card.rarity) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }));
}
