import type { WishlistItem } from '@/api/schemas';

import { wishlistCost } from '../wishlist';

const item = (id: number, price: number | null, quantity = 1): WishlistItem => ({
  id,
  card_id: `c${id}`,
  quantity,
  card: { id: `c${id}`, name: `Card ${id}`, price_trend: price },
});

describe('wishlistCost', () => {
  it('adds priced cards times the quantity wanted', () => {
    expect(wishlistCost([item(1, 2.5, 2), item(2, 1)])).toEqual({
      total: 6,
      unpriced: 0,
      count: 2,
    });
  });

  it('counts unpriced cards instead of treating them as free', () => {
    expect(wishlistCost([item(1, null), item(2, 0), item(3, 3)])).toEqual({
      total: 3,
      unpriced: 2,
      count: 3,
    });
  });

  it('is empty for an empty wishlist', () => {
    expect(wishlistCost([])).toEqual({ total: 0, unpriced: 0, count: 0 });
  });
});
