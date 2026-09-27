import { PokeCollectorClient } from '../client';
import { removeFromCollection, searchCards, updateCollectionItem } from '../endpoints';
import { CREDENTIALS, fakeFetch, loginOk } from './fake-server';

describe('endpoints', () => {
  it('searches with the page parameters upstream expects', async () => {
    const { fetch, calls } = fakeFetch(({ url }) =>
      url.endsWith('/login')
        ? loginOk('t')
        : { status: 200, body: { data: [], total_count: 0, page: 2, page_size: 30 } },
    );
    await searchCards(new PokeCollectorClient(CREDENTIALS, fetch), { q: 'pika chu', page: 2 });
    expect(calls[1]?.url).toBe(
      'https://pc.example.com/api/cards/search?q=pika%20chu&page=2&page_size=30',
    );
  });

  it('removes with DELETE and updates quantity with PUT', async () => {
    const { fetch, calls } = fakeFetch(({ url, method }) => {
      if (url.endsWith('/login')) return loginOk('t');
      if (method === 'DELETE') return { status: 200, body: { message: 'Removed' } };
      return { status: 200, body: { id: 7, card_id: 'c', quantity: 3, condition: 'NM' } };
    });
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await updateCollectionItem(client, 7, { quantity: 3 });
    await removeFromCollection(client, 7);
    expect(calls.slice(1).map((c) => `${c.method} ${c.url}`)).toEqual([
      'PUT https://pc.example.com/api/collection/7',
      'DELETE https://pc.example.com/api/collection/7',
    ]);
    expect(calls[1]?.body).toBe('{"quantity":3}');
  });
});
