/**
 * The artist directory and checklist (upstream 1.59.0, #472): what the app
 * asks for, and that upstream's own answers parse.
 */
import { PokeCollectorClient } from '../client';
import { getArtistChecklist, getArtists } from '../endpoints';
import { NotFoundError } from '../errors';
import { ArtistChecklistSchema, ArtistIndexSchema } from '../schemas';
import { artistChecklist, artistIndex, artistMissing } from './artist-fixtures';
import { CREDENTIALS, fakeFetch } from './fake-server';

function client(answer: unknown, status = 200) {
  const { fetch, calls } = fakeFetch(() => ({ status, body: answer }));
  return { client: new PokeCollectorClient(CREDENTIALS, fetch, { token: 't' }), calls };
}

describe("upstream 1.59.0's answers", () => {
  it('parse, directory and checklist alike', () => {
    const index = ArtistIndexSchema.parse(artistIndex);
    expect(index.artists.map((a) => [a.name, a.owned_count, a.total_count])).toContainEqual([
      'Mitsuhiro Arita',
      1,
      4,
    ]);
    expect(index.artists[0]?.preview_cards?.[0]?.id).toBe('sv9-2_en');
    const list = ArtistChecklistSchema.parse(artistChecklist);
    expect(list).toMatchObject({ total_count: 4, owned_count: 1, list_count: 4 });
    expect(list.cards.map((c) => c.id)).toContain('sv8-123_en');
    expect(list.cards.find((c) => c.id === 'sv7-5_en')).toMatchObject({
      owned: false,
      set_name: 'Stellar Crown',
    });
  });

  it('count the whole artist, and page through what the filter leaves', () => {
    const missing = ArtistChecklistSchema.parse(artistMissing);
    expect(missing).toMatchObject({ total_count: 4, owned_count: 1, list_count: 3 });
    expect(missing.cards.every((c) => !c.owned)).toBe(true);
  });
});

describe('requests', () => {
  it('ask for the directory most complete first, 50 a page', async () => {
    const { client: c, calls } = client(artistIndex);
    await getArtists(c, { q: 'arita', page: 2 });
    expect(calls[0]?.url).toBe(
      'https://pc.example.com/api/cards/artists?q=arita&sort_by=progress&page=2&page_size=50',
    );
    await getArtists(c, { q: '', page: 1 });
    expect(calls[1]?.url).toBe(
      'https://pc.example.com/api/cards/artists?sort_by=progress&page=1&page_size=50',
    );
  });

  it('ask for one artist by exact name, 60 a page, missing only upstream', async () => {
    const { client: c, calls } = client(artistChecklist);
    await getArtistChecklist(c, { artist: 'Mitsuhiro Arita', missingOnly: false, page: 1 });
    expect(calls[0]?.url).toBe(
      'https://pc.example.com/api/cards/artist-checklist?artist=Mitsuhiro%20Arita&artist_match=exact&page=1&page_size=60&sort_by=number',
    );
    await getArtistChecklist(c, { artist: 'Mitsuhiro Arita', missingOnly: true, page: 3 });
    expect(calls[1]?.url).toBe(
      'https://pc.example.com/api/cards/artist-checklist?artist=Mitsuhiro%20Arita&artist_match=exact&ownership=missing&page=3&page_size=60&sort_by=number',
    );
  });

  it('report an older server as not found', async () => {
    const { client: c } = client({ detail: 'Not Found' }, 404);
    await expect(getArtists(c, { q: '', page: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });
});
