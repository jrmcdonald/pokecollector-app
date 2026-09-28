/**
 * The fake server's answers, parsed with the app's own schemas: if the app
 * would reject them, the simulator tests would fail for the wrong reason.
 */
import {
  AuthModeSchema,
  BinderCardsSchema,
  BindersSchema,
  CardSchema,
  ChecklistSchema,
  CollectionSchema,
  DashboardSchema,
  PrintingDetailTagsSchema,
  SearchResponseSchema,
  SetsSchema,
  TokenResponseSchema,
  UserSchema,
  WishlistSchema,
} from '../../../src/api/schemas';
import { bindersOnly } from '../../../src/utils/binders';
import { PASSWORD, USERNAME } from '../fixtures.ts';
import { createRouter, TOKEN, type Reply } from '../routes.ts';

const ORIGIN = 'https://localhost:8443';
const route = createRouter(ORIGIN);

function get(url: string, authorised = true) {
  return route({
    method: 'GET',
    url,
    headers: authorised ? { authorization: `Bearer ${TOKEN}` } : {},
    body: '',
  });
}

function json(reply: Reply): unknown {
  if (!('json' in reply)) throw new Error(`Expected JSON, got status ${reply.status}`);
  expect(reply.status).toBe(200);
  return reply.json;
}

describe('fake PokeCollector', () => {
  it('logs in with the fixture account only', () => {
    const login = (password: string) =>
      route({
        method: 'POST',
        url: '/api/auth/login',
        headers: {},
        body: new URLSearchParams({ username: USERNAME, password }).toString(),
      });
    expect(TokenResponseSchema.parse(json(login(PASSWORD))).access_token).toBe(TOKEN);
    expect(login('wrong').status).toBe(401);
    expect(get('/api/dashboard/', false).status).toBe(401);
    expect(AuthModeSchema.parse(json(get('/api/auth/mode', false))).multi_user).toBe(true);
  });

  it('answers every screen in shapes the app accepts', () => {
    UserSchema.parse(json(get('/api/auth/me')));
    const dashboard = DashboardSchema.parse(json(get('/api/dashboard/')));
    expect(dashboard.recent_additions.length).toBeGreaterThan(3);
    expect(dashboard.top_cards?.length).toBeGreaterThan(3);

    const collection = CollectionSchema.parse(json(get('/api/collection/')));
    expect(new Set(collection.map((i) => i.id)).size).toBe(collection.length);
    expect(collection.some((i) => i.variant === 'Holo')).toBe(true);
    expect(collection.some((i) => i.quantity > 1)).toBe(true);

    PrintingDetailTagsSchema.parse(json(get('/api/collection/printing-detail-tags')));
    const wishlist = WishlistSchema.parse(json(get('/api/wishlist/')));
    expect(wishlist.some((i) => !i.card?.price_trend)).toBe(true);

    const sets = SetsSchema.parse(json(get('/api/sets/')));
    for (const set of sets) ChecklistSchema.parse(json(get(`/api/sets/${set.id}/checklist`)));
    expect(sets.some((s) => !s.owned_count)).toBe(true);

    const binders = bindersOnly(BindersSchema.parse(json(get('/api/binders/'))));
    expect(binders.map((b) => b.binder_type).sort()).toEqual(['collection', 'wishlist']);
    for (const binder of binders) {
      const cards = BinderCardsSchema.parse(json(get(`/api/binders/${binder.id}/cards`)));
      expect(cards.cards.length).toBeGreaterThan(0);
    }

    const search = SearchResponseSchema.parse(
      json(get('/api/cards/search?q=pika&page=1&page_size=30')),
    );
    expect(search.data.map((c) => c.name)).toContain('Pikachu');
    const card = CardSchema.parse(json(get(`/api/cards/${encodeURIComponent('sv1-063_en')}`)));
    expect(card.name).toBe('Pikachu');
  });

  it('serves a placeholder for every card image it hands out', () => {
    const collection = CollectionSchema.parse(json(get('/api/collection/')));
    const url = collection[0]?.card?.images_small ?? '';
    expect(url.startsWith(`${ORIGIN}/images/cards/`)).toBe(true);
    const reply = get(url.slice(ORIGIN.length), false);
    expect('png' in reply && reply.png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(get('/api/pokedex/images/artwork/25.png', false).status).toBe(200);
  });

  it('refuses writes, so a test that starts writing fails clearly', () => {
    const reply = route({
      method: 'POST',
      url: '/api/wishlist/',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: '{}',
    });
    expect(reply.status).toBe(501);
  });
});
