/**
 * Which binders hold a card. Upstream has no lookup by card, so, as for
 * decks (`deckContents`), the app keeps an index of every binder's cards.
 */
import type { PokeCollectorClient } from './client';
import { getBinderCards } from './endpoints';
import type { Binder, BinderCards } from './schemas';

/** One binder's cards, by card id: how many copies it holds or plans. */
export interface BinderContents {
  id: number;
  name: string;
  binder_type?: string | null;
  color?: string | null;
  /** What the binder list said when the binder was read: see `binderContents`. */
  version: string;
  cards: Record<string, number>;
}

/**
 * What the binder list says that changes with the binder's cards. Upstream
 * does not move a binder's `updated_at` when its cards change, but its
 * counts do; a swap that keeps both counts is missed until the binder is
 * read again for another reason.
 */
function version(binder: Binder): string {
  return [binder.updated_at ?? '', binder.card_count ?? 0, binder.unique_card_count ?? 0].join('|');
}

/**
 * Every binder's cards, from the binder list. A binder read before whose
 * counts have not changed is taken from `previous`, so after the first time
 * this is one request per binder changed since. Binders are read one at a
 * time, to keep within the rate limit. `onBinder` gets each binder read, so
 * its own page need not read it again.
 */
export async function binderContents(
  client: PokeCollectorClient,
  binders: readonly Binder[],
  previous: readonly BinderContents[] = [],
  onBinder?: (id: number, cards: BinderCards) => void,
): Promise<BinderContents[]> {
  const known = new Map(previous.map((binder) => [binder.id, binder]));
  const result: BinderContents[] = [];
  for (const summary of binders) {
    const listed = { name: summary.name, binder_type: summary.binder_type, color: summary.color };
    const before = known.get(summary.id);
    if (before && before.version === version(summary)) {
      result.push({ ...before, ...listed });
      continue;
    }
    const read = await getBinderCards(client, summary.id);
    onBinder?.(summary.id, read);
    const cards: Record<string, number> = {};
    for (const card of read.cards) {
      cards[card.id] = (cards[card.id] ?? 0) + (card.required_quantity ?? 1);
    }
    result.push({ id: summary.id, ...listed, version: version(summary), cards });
  }
  return result;
}

/** The binders that hold or plan the card, with how many copies each does. */
export function bindersWithCard(
  binders: readonly BinderContents[],
  cardId: string,
): (BinderContents & { copies: number })[] {
  return binders.flatMap((binder) => {
    const copies = binder.cards[cardId] ?? 0;
    return copies > 0 ? [{ ...binder, copies }] : [];
  });
}
