/** The wishlist's cost, without pretending an unpriced card is free. */
import type { WishlistItem } from '@/api/schemas';

import { cardValue } from './pricing';

export interface WishlistCost {
  /** The priced cards' total, each times the quantity wanted. */
  total: number;
  /** Entries with no price yet; they are left out of `total`. */
  unpriced: number;
  /** Entries in all. */
  count: number;
}

export function wishlistCost(items: readonly WishlistItem[]): WishlistCost {
  let total = 0;
  let unpriced = 0;
  for (const item of items) {
    const price = cardValue(item.card);
    if (price > 0) total += price * item.quantity;
    else unpriced += 1;
  }
  return { total, unpriced, count: items.length };
}
