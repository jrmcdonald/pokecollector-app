import type { Deck } from '@/api/schemas';

import { withEntryQuantity } from '../decks';

const DECK: Deck = {
  id: 1,
  name: 'Test',
  binder_type: 'deck',
  current_card_count: 6,
  missing_copy_count: 3,
  entries: [
    { id: 10, card_id: 'a', required_quantity: 4, shortage: 3 },
    { id: 11, card_id: 'b', required_quantity: 2, shortage: 0 },
  ],
};

describe('withEntryQuantity', () => {
  it('takes fewer copies off the count and off what is missing', () => {
    const deck = withEntryQuantity(DECK, 10, 2);
    expect(deck.current_card_count).toBe(4);
    expect(deck.missing_copy_count).toBe(1);
    expect(deck.entries?.[0]).toMatchObject({ required_quantity: 2, shortage: 1 });
  });

  it('adds more copies to the count, leaving what is missing to upstream', () => {
    const deck = withEntryQuantity(DECK, 11, 3);
    expect(deck.current_card_count).toBe(7);
    expect(deck.missing_copy_count).toBe(3);
    expect(deck.entries?.[1]).toMatchObject({ required_quantity: 3, shortage: 0 });
  });

  it('takes the card out at 0', () => {
    const deck = withEntryQuantity(DECK, 10, 0);
    expect(deck.entries?.map((e) => e.id)).toEqual([11]);
    expect(deck.current_card_count).toBe(2);
    expect(deck.missing_copy_count).toBe(0);
  });

  it('leaves the deck alone for an entry it does not have', () => {
    expect(withEntryQuantity(DECK, 99, 1)).toBe(DECK);
  });
});
