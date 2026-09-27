import { CollectionSchema, DashboardSchema, SearchResponseSchema } from '../schemas';

// Shapes copied from a live 1.51.0 server's responses, with made-up values.
const card = {
  id: 'xy1-1_en',
  name: 'Venusaur-EX',
  number: '1',
  set_id: 'xy1',
  rarity: 'Rare Holo EX',
  images_small: 'https://assets.tcgdex.net/en/xy/xy1/1/low.webp',
  images_large: 'https://assets.tcgdex.net/en/xy/xy1/1/high.webp',
  custom_image_url: null,
  is_custom: false,
  price_trend: 3.5,
  price_market: null,
  price_trend_holo: 2.3,
  variants_normal: false,
  variants_holo: true,
  variants_reverse: false,
  variants_first_edition: false,
  // Fields the app does not use must not break parsing.
  playable_fingerprint: 'abc',
  attacks: [{ name: 'Poison Powder', damage: 60 }],
};

describe('response schemas', () => {
  it('parses a search page with ownership fields', () => {
    const parsed = SearchResponseSchema.parse({
      data: [
        {
          ...card,
          set_ref: { id: 'xy1_en', tcg_set_id: 'xy1', name: 'XY', abbreviation: 'XY', lang: 'en' },
          owned: true,
          owned_quantity: 2,
          owned_variants: ['Holo'],
          wishlisted: false,
          owned_items: [],
        },
      ],
      total_count: 243,
      page: 1,
      page_size: 30,
    });
    expect(parsed.data[0]).toMatchObject({ owned_quantity: 2, set_ref: { name: 'XY' } });
  });

  it('keeps a collection entry whose variant or condition it does not know', () => {
    const parsed = CollectionSchema.parse([
      {
        id: 1,
        card_id: card.id,
        quantity: 1,
        condition: 'Excellent',
        variant: 'Staff Stamp',
        lang: 'en',
        added_at: '2026-09-27T10:00:00',
        card,
      },
    ]);
    expect(parsed).toHaveLength(1);
  });

  it('parses an empty dashboard', () => {
    const parsed = DashboardSchema.parse({
      total_cards: 0,
      unique_cards: 0,
      total_value: 0,
      total_sets: 221,
      owned_sets: 0,
      top_cards: [],
      recent_additions: [],
      value_history: [{ date: '2026-09-27T00:00:00', value: 0 }],
      price_field: 'price_trend',
    });
    expect(parsed.total_sets).toBe(221);
  });
});
