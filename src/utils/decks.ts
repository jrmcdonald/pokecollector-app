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

/**
 * The deck as it will be once an entry lists `quantity` copies, or without
 * the entry at 0: what the page shows while upstream saves it. Fewer copies
 * mean fewer missing; more may or may not, which upstream's answer settles.
 */
export function withEntryQuantity(deck: Deck, entryId: number, quantity: number): Deck {
  const entry = deck.entries?.find((e) => e.id === entryId);
  if (!entry) return deck;
  const change = quantity - entry.required_quantity;
  const shortage = entry.shortage ?? 0;
  const lessMissing = change < 0 ? Math.min(shortage, -change) : 0;
  return {
    ...deck,
    current_card_count:
      deck.current_card_count == null ? deck.current_card_count : deck.current_card_count + change,
    missing_copy_count:
      deck.missing_copy_count == null
        ? deck.missing_copy_count
        : Math.max(deck.missing_copy_count - lessMissing, 0),
    entries:
      quantity > 0
        ? deck.entries?.map((e) =>
            e.id === entryId
              ? { ...e, required_quantity: quantity, shortage: shortage - lessMissing }
              : e,
          )
        : deck.entries?.filter((e) => e.id !== entryId),
  };
}
