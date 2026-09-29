import { PokeCollectorClient } from '../client';
import { addDeckToCollection, collectionAdds, importDecklist, langOf } from '../decks';
import type { Deck } from '../schemas';
import { parseDecklist } from '@/utils/decklist';
import { CREDENTIALS, fakeFetch, loginOk, type Call } from './fake-server';

const LIST = `4 Pikachu ex SVI 57
2 Made Up ZZZ 1
3 Nest Ball
8 Basic {L} Energy SVE 4`;

const DECK: Deck = {
  id: 9,
  name: 'Pikachu ex Battle Deck',
  binder_type: 'deck',
  entries: [
    {
      id: 1,
      card_id: 'sv01-057_en',
      required_quantity: 4,
      card: { id: 'sv01-057_en', name: 'Pikachu ex', variants_normal: false, variants_holo: true },
    },
    { id: 2, card_id: 'sve-004_en', required_quantity: 8, card: null },
  ],
};

async function csvOf(call: Call): Promise<string> {
  const file = (call.body as FormData).get('file') as Blob;
  return file.text();
}

describe('importDecklist', () => {
  it('imports what upstream finds, again without the rows it could not', async () => {
    const csvs: string[] = [];
    const { fetch, calls } = fakeFetch(async (call) => {
      const { url, method } = call;
      if (url.endsWith('/login')) return loginOk('t');
      if (url.endsWith('/api/decks/') && method === 'POST')
        return { status: 200, body: { id: 9, name: 'Pikachu ex Battle Deck' } };
      if (url.endsWith('/import-csv')) {
        csvs.push(await csvOf(call));
        return csvs.length === 1
          ? { status: 200, body: { added: 0, failed: 1, errors: ['row 3: card was not found'] } }
          : { status: 200, body: { added: 2, failed: 0, errors: [] } };
      }
      return { status: 200, body: DECK };
    });
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    const result = await importDecklist(client, {
      name: 'Pikachu ex Battle Deck',
      cards: parseDecklist(LIST).cards,
      lang: 'en',
      toFile: (csv) => new File([csv], 'deck.csv', { type: 'text/csv' }),
    });

    expect(calls.slice(1).map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://pc.example.com/api/decks/',
      'POST https://pc.example.com/api/binders/9/import-csv',
      'POST https://pc.example.com/api/binders/9/import-csv',
      'GET https://pc.example.com/api/decks/9',
    ]);
    expect(JSON.parse(calls[1]?.body as string)).toEqual({
      name: 'Pikachu ex Battle Deck',
      format: 'Casual',
    });
    expect(csvs[1]).toBe('set_code,number,required_quantity,lang\nSVI,57,4,en\nSVE,4,8,en\n');
    expect(result.unresolved.map((line) => line.name)).toEqual(['Made Up', 'Nest Ball']);
    expect(result.deck.entries).toHaveLength(2);
  });

  it('deletes the deck when the import fails', async () => {
    const { fetch, calls } = fakeFetch(({ url, method }) => {
      if (url.endsWith('/login')) return loginOk('t');
      if (url.endsWith('/api/decks/')) return { status: 200, body: { id: 9, name: 'D' } };
      if (url.endsWith('/import-csv')) return { status: 500, body: { detail: 'boom' } };
      if (method === 'DELETE') return { status: 200, body: { message: 'Deleted' } };
      return { status: 404 };
    });
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await expect(
      importDecklist(client, {
        name: 'D',
        cards: parseDecklist(LIST).cards,
        lang: 'en',
        toFile: (csv) => new File([csv], 'deck.csv'),
      }),
    ).rejects.toThrow();
    expect(calls.at(-1)?.method).toBe('DELETE');
    expect(calls.at(-1)?.url).toBe('https://pc.example.com/api/decks/9');
  });
});

describe('collectionAdds', () => {
  it("adds every copy as the card's usual variant, Near Mint, in its language", () => {
    expect(collectionAdds(DECK.entries ?? [])).toEqual([
      { card_id: 'sv01-057_en', quantity: 4, variant: 'Holo', condition: 'NM', lang: 'en' },
      { card_id: 'sve-004_en', quantity: 8, variant: 'Normal', condition: 'NM', lang: 'en' },
    ]);
  });

  it('reads the language from the card id', () => {
    expect(langOf('sv01-057_de')).toBe('de');
    expect(langOf('sv01-057')).toBe('en');
  });
});

describe('addDeckToCollection', () => {
  it('adds in one request, then makes the deck real', async () => {
    const { fetch, calls } = fakeFetch(({ url }) => {
      if (url.endsWith('/login')) return loginOk('t');
      if (url.endsWith('/bulk-add'))
        return { status: 200, body: { added: 2, updated: 0, failed: 0, errors: [] } };
      return { status: 200, body: { ...DECK, binder_type: 'physical_deck' } };
    });
    const result = await addDeckToCollection(new PokeCollectorClient(CREDENTIALS, fetch), DECK);
    expect(calls.slice(1).map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://pc.example.com/api/collection/bulk-add',
      'POST https://pc.example.com/api/decks/9/convert-to-real',
    ]);
    expect(result.real).toBe(true);
    expect(result.deck.binder_type).toBe('physical_deck');
  });

  it('keeps the deck planned when upstream will not reserve the copies', async () => {
    const { fetch } = fakeFetch(({ url }) => {
      if (url.endsWith('/login')) return loginOk('t');
      if (url.endsWith('/bulk-add'))
        return { status: 200, body: { added: 1, updated: 0, failed: 1, errors: ['x'] } };
      return { status: 409, body: { detail: 'Every required card must be owned' } };
    });
    const result = await addDeckToCollection(new PokeCollectorClient(CREDENTIALS, fetch), DECK);
    expect(result).toMatchObject({ real: false, added: { failed: 1 } });
  });
});
