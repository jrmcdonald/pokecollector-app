import type { CollectionItem } from '@/api/schemas';

import {
  NO_FILTER,
  compareCollectorNumbers,
  entriesForCard,
  filterCollection,
  filterOptions,
  sortCollection,
} from '../collection';

// Made-up cards in the shape upstream returns; not anyone's collection.
function item(
  id: number,
  name: string,
  opts: Partial<{
    set: [string, string];
    number: string;
    rarity: string;
    variant: string;
    quantity: number;
    trend: number;
    added: string;
    artist: string;
  }> = {},
): CollectionItem {
  const [setId, setName] = opts.set ?? ['sv1_en', 'Scarlet & Violet'];
  return {
    id,
    card_id: `card-${id}`,
    quantity: opts.quantity ?? 1,
    condition: 'NM',
    variant: opts.variant ?? 'Normal',
    added_at: opts.added ?? `2026-01-0${id}T00:00:00`,
    card: {
      id: `card-${id}`,
      name,
      number: opts.number ?? String(id),
      rarity: opts.rarity ?? 'Common',
      artist: opts.artist ?? null,
      set_id: setId.replace('_en', ''),
      set_ref: { id: setId, name: setName },
      price_trend: opts.trend ?? 1,
    },
  };
}

const items = [
  item(1, 'Pikachu', { number: '10', trend: 2, rarity: 'Rare', artist: 'Mitsuhiro Arita' }),
  item(2, 'Bulbasaur', { number: '9', trend: 0.5, quantity: 4 }),
  item(3, 'Charizard ex', {
    set: ['sv3_en', 'Obsidian Flames'],
    number: '125',
    trend: 40,
    rarity: 'Double Rare',
    variant: 'Holo',
  }),
];

describe('filterCollection', () => {
  it('matches name, set, number and artist, ignoring case', () => {
    expect(filterCollection(items, { ...NO_FILTER, query: 'pika' }).map((i) => i.id)).toEqual([1]);
    expect(filterCollection(items, { ...NO_FILTER, query: 'obsidian' }).map((i) => i.id)).toEqual([
      3,
    ]);
    expect(filterCollection(items, { ...NO_FILTER, query: 'ARITA' }).map((i) => i.id)).toEqual([1]);
  });

  it('combines set, rarity and variant filters', () => {
    expect(filterCollection(items, { ...NO_FILTER, setId: 'sv1_en' })).toHaveLength(2);
    expect(filterCollection(items, { ...NO_FILTER, setId: 'sv1_en', rarity: 'Rare' })).toHaveLength(
      1,
    );
    expect(filterCollection(items, { ...NO_FILTER, variant: 'Holo' }).map((i) => i.id)).toEqual([
      3,
    ]);
  });

  it('returns everything for no filter', () => {
    expect(filterCollection(items, NO_FILTER)).toHaveLength(3);
  });
});

describe('sortCollection', () => {
  const ids = (sorted: CollectionItem[]) => sorted.map((i) => i.id);

  it('sorts newest first', () => {
    expect(ids(sortCollection(items, 'recent'))).toEqual([3, 2, 1]);
  });

  it('sorts by the value of the whole entry', () => {
    // 40 × 1, 2 × 1, 0.5 × 4 = 2 → tie broken by name.
    expect(ids(sortCollection(items, 'value'))).toEqual([3, 2, 1]);
  });

  it('sorts by set, then collector number as a number', () => {
    expect(ids(sortCollection(items, 'number'))).toEqual([3, 2, 1]);
  });

  it('does not change its input', () => {
    const before = ids(items);
    sortCollection(items, 'name');
    expect(ids(items)).toEqual(before);
  });
});

describe('compareCollectorNumbers', () => {
  it('orders digit runs numerically', () => {
    const numbers = ['10', '9', 'TG12', 'TG2', '045', 'SM109', 'SM11'];
    expect([...numbers].sort(compareCollectorNumbers)).toEqual([
      '9',
      '10',
      '045',
      'SM11',
      'SM109',
      'TG2',
      'TG12',
    ]);
  });
});

describe('filterOptions', () => {
  it('lists what is present, counting copies', () => {
    const options = filterOptions(items);
    expect(options.sets).toEqual([
      { value: 'sv3_en', label: 'Obsidian Flames', count: 1 },
      { value: 'sv1_en', label: 'Scarlet & Violet', count: 5 },
    ]);
    expect(options.variants.map((v) => v.value)).toEqual(['Holo', 'Normal']);
  });
});

describe('entriesForCard', () => {
  it('finds every entry for a card, and copes with no collection yet', () => {
    expect(entriesForCard(items, 'card-2').map((i) => i.id)).toEqual([2]);
    expect(entriesForCard(undefined, 'card-2')).toEqual([]);
  });
});
