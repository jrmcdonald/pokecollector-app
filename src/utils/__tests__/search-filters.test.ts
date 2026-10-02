import {
  NO_SEARCH_FILTER,
  RARITIES,
  exactRarity,
  hasFilter,
  rarityIsAmbiguous,
  rarityLabel,
  rarityOptions,
  searchQuery,
} from '../search-filters';

describe('rarityLabel', () => {
  it('capitalises each word and leaves capitals alone', () => {
    expect(rarityLabel('Double rare')).toBe('Double Rare');
    expect(rarityLabel('Special illustration rare')).toBe('Special Illustration Rare');
    expect(rarityLabel('ACE SPEC Rare')).toBe('ACE SPEC Rare');
  });
});

describe('rarityOptions', () => {
  it('adds the collection’s other rarities after the known ones, once each', () => {
    const options = rarityOptions(['Rare Holo LV.X', 'double RARE', null, 'Rare Holo LV.X']);
    expect(options.slice(0, RARITIES.length)).toEqual([...RARITIES]);
    expect(options.slice(RARITIES.length)).toEqual(['Rare Holo LV.X']);
  });

  it('leaves out TCGdex’s None', () => {
    expect(rarityOptions(['None'])).not.toContain('None');
  });
});

describe('searchQuery', () => {
  it('sends nothing for no filter', () => {
    expect(searchQuery(NO_SEARCH_FILTER)).toEqual({
      set_id: undefined,
      rarity: undefined,
      category: undefined,
      type: undefined,
    });
    expect(hasFilter(NO_SEARCH_FILTER)).toBe(false);
  });

  it('sends each filter under upstream’s name', () => {
    const filter = {
      set: { id: 'sv03.5_en', name: '151' },
      rarity: 'Double rare',
      category: 'Pokemon' as const,
      type: 'Fire',
    };
    expect(searchQuery(filter)).toEqual({
      set_id: 'sv03.5_en',
      rarity: 'Double rare',
      category: 'Pokemon',
      type: 'Fire',
    });
    expect(hasFilter(filter)).toBe(true);
  });

  it('drops the type for a Trainer or an Energy', () => {
    expect(
      searchQuery({ ...NO_SEARCH_FILTER, category: 'Trainer', type: 'Fire' }).type,
    ).toBeUndefined();
  });
});

describe('rarityIsAmbiguous', () => {
  const known = rarityOptions([]);

  it('is when another rarity contains it, as upstream matches', () => {
    expect(rarityIsAmbiguous('Rare', known)).toBe(true);
    expect(rarityIsAmbiguous('Common', known)).toBe(true);
    expect(rarityIsAmbiguous('Illustration rare', known)).toBe(true);
  });

  it('is not when nothing else contains it', () => {
    expect(rarityIsAmbiguous('Special illustration rare', known)).toBe(false);
    expect(rarityIsAmbiguous('Uncommon', known)).toBe(false);
  });
});

describe('exactRarity', () => {
  const cards = [
    { id: 'a', rarity: 'Rare' },
    { id: 'b', rarity: 'Ultra Rare' },
    { id: 'c', rarity: 'rare' },
    { id: 'd', rarity: null },
  ];

  it('keeps only that rarity, whatever its case', () => {
    expect(exactRarity(cards, 'Rare').map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('keeps everything without one', () => {
    expect(exactRarity(cards, null)).toHaveLength(4);
  });
});
