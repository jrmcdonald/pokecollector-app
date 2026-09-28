import type { CardSet } from '@/api/schemas';

import { completion, filterSets, isOwned } from '../sets';

const sets: CardSet[] = [
  {
    id: 'sv1_en',
    name: 'Scarlet & Violet',
    series: 'Scarlet & Violet',
    owned_count: 4,
    total: 258,
  },
  { id: 'xy1_en', name: 'XY', series: 'XY', abbreviation: 'XY', owned_count: 0, total: 146 },
  { id: 'base1_en', name: 'Base Set', series: 'Base', owned_count: 1, total: 102 },
];

describe('completion', () => {
  it('is owned over total, clamped', () => {
    expect(completion(51, 102)).toBe(0.5);
    expect(completion(5, 4)).toBe(1);
  });

  it('is 0 without a total', () => {
    expect(completion(3, 0)).toBe(0);
    expect(completion(3, null)).toBe(0);
  });
});

describe('filterSets', () => {
  it('keeps only started sets when asked', () => {
    expect(filterSets(sets, { query: '', startedOnly: true }).map((s) => s.id)).toEqual([
      'sv1_en',
      'base1_en',
    ]);
  });

  it('matches name, series and abbreviation, ignoring case', () => {
    expect(filterSets(sets, { query: 'base', startedOnly: false }).map((s) => s.id)).toEqual([
      'base1_en',
    ]);
    expect(filterSets(sets, { query: 'xy', startedOnly: false }).map((s) => s.id)).toEqual([
      'xy1_en',
    ]);
  });
});

describe('isOwned', () => {
  it('reads either the flag or the quantity', () => {
    expect(isOwned({ id: 'a', name: 'A', owned: false, owned_quantity: 2 })).toBe(true);
    expect(isOwned({ id: 'a', name: 'A', owned: true })).toBe(true);
    expect(isOwned({ id: 'a', name: 'A' })).toBe(false);
  });
});
