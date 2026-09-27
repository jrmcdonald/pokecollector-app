import type { Binder } from '@/api/schemas';

import { binderColor, binderKind, bindersOnly, isPlanned } from '../binders';

const list: Binder[] = [
  { id: 1, name: 'Main', binder_type: 'collection', color: '#EE1515' },
  { id: 2, name: 'To get', binder_type: 'wishlist', color: 'red' },
  { id: 3, name: 'Deck', binder_type: 'deck' },
  { id: 4, name: 'Real deck', binder_type: 'physical_deck' },
  { id: 5, name: 'Old', binder_type: null },
];

describe('binders', () => {
  it('leaves decks out', () => {
    expect(bindersOnly(list).map((b) => b.id)).toEqual([1, 2, 5]);
  });

  it('tells planned binders from collection binders', () => {
    expect(isPlanned(list[1]!)).toBe(true);
    expect(binderKind(list[0]!)).toBe('Collection');
    expect(binderKind(list[4]!)).toBe('Collection');
  });

  it('uses only hex colors', () => {
    expect(binderColor(list[0]!, '#000000')).toBe('#EE1515');
    expect(binderColor(list[1]!, '#000000')).toBe('#000000');
  });
});
