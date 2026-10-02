import type { CardSet, ChecklistCard } from '@/api/schemas';

import {
  checklistRarities,
  completion,
  filterChecklist,
  filterSets,
  isOwned,
  matchesCard,
} from '../sets';

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

describe('matchesCard', () => {
  const card = { name: 'Flabébé', number: '025' };

  it('finds a name anywhere in it, without regard to case or accents', () => {
    expect(matchesCard(card, 'flabe')).toBe(true);
    expect(matchesCard(card, 'BÉBÉ')).toBe(true);
    expect(matchesCard(card, 'pikachu')).toBe(false);
  });

  it('finds a number exactly, with or without its zeros or the set total', () => {
    expect(matchesCard(card, '25')).toBe(true);
    expect(matchesCard(card, '025')).toBe(true);
    expect(matchesCard(card, '25/165')).toBe(true);
    expect(matchesCard(card, '2')).toBe(false);
    expect(matchesCard({ name: 'Pikachu', number: 'TG05' }, 'tg05')).toBe(true);
  });

  it('matches everything with no search', () => {
    expect(matchesCard(card, '  ')).toBe(true);
  });
});

describe('filterChecklist', () => {
  const cards: ChecklistCard[] = [
    { id: '1', name: 'Bulbasaur', number: '001', rarity: 'Common', owned_quantity: 1 },
    { id: '2', name: 'Ivysaur', number: '002', rarity: 'Uncommon' },
    { id: '3', name: 'Venusaur ex', number: '003', rarity: 'Double rare', owned: true },
    { id: '4', name: 'Venusaur ex', number: '198', rarity: 'Special illustration rare' },
  ];
  const ids = (list: ChecklistCard[]) => list.map((c) => c.id);

  it('combines the search with what to show', () => {
    expect(ids(filterChecklist(cards, { show: 'all', query: 'saur', rarity: null }))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(ids(filterChecklist(cards, { show: 'missing', query: 'venu', rarity: null }))).toEqual([
      '4',
    ]);
    expect(ids(filterChecklist(cards, { show: 'owned', query: '', rarity: null }))).toEqual([
      '1',
      '3',
    ]);
  });

  it('keeps one rarity exactly', () => {
    expect(ids(filterChecklist(cards, { show: 'all', query: '', rarity: 'Double rare' }))).toEqual([
      '3',
    ]);
  });
});

describe('checklistRarities', () => {
  it('counts each rarity, in the order they first appear', () => {
    expect(
      checklistRarities([
        { id: '1', name: 'A', rarity: 'Common' },
        { id: '2', name: 'B', rarity: 'Uncommon' },
        { id: '3', name: 'C', rarity: 'Common' },
        { id: '4', name: 'D' },
      ]),
    ).toEqual([
      { value: 'Common', count: 2 },
      { value: 'Uncommon', count: 1 },
    ]);
  });
});
