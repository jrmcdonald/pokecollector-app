import { binderContents, bindersWithCard } from '../binders';
import { PokeCollectorClient } from '../client';
import type { Binder } from '../schemas';
import { CREDENTIALS, fakeFetch, loginOk } from './fake-server';

describe('binderContents', () => {
  const card = (binderCardId: number, id: string, required?: number) => ({
    id,
    binder_card_id: binderCardId,
    name: id,
    required_quantity: required,
  });
  const LIST: Binder[] = [
    { id: 1, name: '151 master set', binder_type: 'wishlist', card_count: 3, unique_card_count: 2 },
    { id: 2, name: 'Trade binder', binder_type: 'collection', card_count: 1, unique_card_count: 1 },
  ];
  const CARDS: Record<string, unknown> = {
    '1': { binder: LIST[0], cards: [card(1, 'a', 2), card(2, 'b', 1)] },
    // A collection binder's entries are exact copies; one with no quantity holds one.
    '2': { binder: LIST[1], cards: [card(3, 'a')] },
  };

  function server() {
    return fakeFetch(({ url }) => {
      if (url.endsWith('/login')) return loginOk('t');
      const id = /\/api\/binders\/(\d+)\/cards$/.exec(url)?.[1] ?? '';
      return CARDS[id] ? { status: 200, body: CARDS[id] } : { status: 404, body: {} };
    });
  }

  it('reads every binder the first time, and counts each card', async () => {
    const { fetch, calls } = server();
    const read: number[] = [];
    const binders = await binderContents(
      new PokeCollectorClient(CREDENTIALS, fetch),
      LIST,
      [],
      (id) => read.push(id),
    );
    expect(calls.slice(1).map((c) => c.url.replace('https://pc.example.com', ''))).toEqual([
      '/api/binders/1/cards',
      '/api/binders/2/cards',
    ]);
    expect(read).toEqual([1, 2]);
    expect(bindersWithCard(binders, 'a').map((b) => [b.name, b.copies])).toEqual([
      ['151 master set', 2],
      ['Trade binder', 1],
    ]);
    expect(bindersWithCard(binders, 'c')).toEqual([]);
  });

  it('reads again only the binders whose counts changed, and drops deleted ones', async () => {
    const first = server();
    const before = await binderContents(new PokeCollectorClient(CREDENTIALS, first.fetch), LIST);

    const changed = [{ ...LIST[1]!, name: 'Renamed', card_count: 2 }];
    const { fetch, calls } = server();
    const after = await binderContents(
      new PokeCollectorClient(CREDENTIALS, fetch),
      changed,
      before,
    );
    expect(calls.slice(1).map((c) => c.url.replace('https://pc.example.com', ''))).toEqual([
      '/api/binders/2/cards',
    ]);
    expect(after.map((b) => b.id)).toEqual([2]);

    const again = server();
    const renamed = [{ ...changed[0]!, name: 'Renamed again' }];
    const same = await binderContents(
      new PokeCollectorClient(CREDENTIALS, again.fetch),
      renamed,
      after,
    );
    expect(again.calls).toHaveLength(0);
    expect(same[0]?.name).toBe('Renamed again');
  });
});
