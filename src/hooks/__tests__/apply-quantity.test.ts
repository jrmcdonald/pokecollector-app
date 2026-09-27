import type { CollectionItem } from '@/api/schemas';

import { applyQuantity } from '../queries';

jest.mock('@/session/session', () => ({ useSession: jest.fn() }));

const entry = (id: number, quantity: number): CollectionItem => ({
  id,
  card_id: `c${id}`,
  quantity,
  condition: 'NM',
});

describe('applyQuantity', () => {
  it('changes one entry and leaves the rest alone', () => {
    const items = [entry(1, 1), entry(2, 3)];
    expect(applyQuantity(items, 2, 5)).toEqual([entry(1, 1), entry(2, 5)]);
    expect(items[1]?.quantity).toBe(3);
  });

  it('removes the entry at zero', () => {
    expect(applyQuantity([entry(1, 1), entry(2, 3)], 1, 0)).toEqual([entry(2, 3)]);
  });

  it('leaves an unloaded collection unloaded', () => {
    expect(applyQuantity(undefined, 1, 2)).toBeUndefined();
  });
});
