import { PokeCollectorClient } from '../client';
import {
  addCardToPlannedBinder,
  addCollectionItemToBinder,
  createScanJob,
  resolveAndAddScan,
  removeBinderEntry,
  removeFromCollection,
  removeFromWishlist,
  searchCards,
  updateCollectionItem,
} from '../endpoints';
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

  it('sends binder changes as query parameters, the way upstream reads them', async () => {
    const { fetch, calls } = fakeFetch(({ url }) =>
      url.endsWith('/login') ? loginOk('t') : { status: 200, body: { message: 'ok' } },
    );
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await addCollectionItemToBinder(client, 4, 17);
    await addCardToPlannedBinder(client, 5, 'sv1-025_en');
    await removeBinderEntry(client, 4, 90);
    await removeFromWishlist(client, 3);
    expect(calls.slice(1).map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://pc.example.com/api/binders/4/collection-items?collection_item_id=17&quantity=1',
      'POST https://pc.example.com/api/binders/5/cards?card_id=sv1-025_en&required_quantity=1',
      'DELETE https://pc.example.com/api/binders/4/entries/90',
      'DELETE https://pc.example.com/api/wishlist/3',
    ]);
    expect(calls[1]?.body).toBeUndefined();
  });

  it('uploads a scan as multipart and confirms it with the candidate id', async () => {
    const { fetch, calls } = fakeFetch(({ url }) => {
      if (url.endsWith('/login')) return loginOk('t');
      if (url.endsWith('/recognize/jobs'))
        return { status: 200, body: { id: 3, status: 'pending' } };
      return {
        status: 200,
        body: {
          item: { id: 7 },
          collection_item: { id: 1, card_id: 'sv1-025_en', quantity: 1, condition: 'NM' },
        },
      };
    });
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await createScanJob(client, new Blob(['jpeg'], { type: 'image/jpeg' }));
    await resolveAndAddScan(client, 3, 7, {
      card_id: 'sv1-025_en',
      confirmedCardId: 'sv1-025',
      quantity: 1,
      variant: 'Normal',
      condition: 'NM',
      lang: 'en',
    });
    expect(calls[1]?.url).toBe('https://pc.example.com/api/cards/recognize/jobs');
    expect(calls[1]?.body).toBeInstanceOf(FormData);
    expect(calls[1]?.headers['Content-Type']).toBeUndefined();
    expect(calls[2]?.url).toBe(
      'https://pc.example.com/api/cards/recognize/jobs/3/items/7/resolve-and-add',
    );
    expect(JSON.parse(String(calls[2]?.body))).toEqual({
      card_id: 'sv1-025_en',
      quantity: 1,
      variant: 'Normal',
      condition: 'NM',
      lang: 'en',
      confirmed_card_id: 'sv1-025',
    });
  });
});
