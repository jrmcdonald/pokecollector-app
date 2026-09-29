/** How the Decks screens describe a deck and its cards. */
import type { Deck, DeckEntry } from '@/api/schemas';

/** A Real Deck reserves owned copies; a planned one is a list to collect. */
export function isRealDeck(deck: Pick<Deck, 'binder_type'>): boolean {
  return deck.binder_type === 'physical_deck';
}

function cards(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`;
}

/** "Real Deck · 60 cards", or "Planned · 60 cards, 12 missing". */
export function deckSummary(deck: Deck): string {
  const count =
    deck.current_card_count ??
    (deck.entries ?? []).reduce((sum, entry) => sum + entry.required_quantity, 0);
  if (isRealDeck(deck)) return `Real Deck · ${cards(count)}`;
  const missing = deck.missing_copy_count ?? 0;
  return `Planned · ${cards(count)}${missing > 0 ? `, ${missing} missing` : ''}`;
}

/** "SVI 57": the code a deck list names the card by. */
export function entryCode(entry: DeckEntry): string {
  const card = entry.card;
  return [card?.set_ref?.abbreviation ?? card?.set_id?.toUpperCase(), card?.number]
    .filter(Boolean)
    .join(' ');
}

/** Copies still to get: none for a Real Deck, whose copies are reserved. */
export function entryMissing(deck: Pick<Deck, 'binder_type'>, entry: DeckEntry): number {
  return isRealDeck(deck) ? 0 : Math.max(entry.shortage ?? 0, 0);
}
