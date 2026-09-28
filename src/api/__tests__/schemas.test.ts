import {
  BinderCardsSchema,
  ChecklistSchema,
  CollectionSchema,
  DashboardSchema,
  SearchResponseSchema,
  SetsSchema,
  WishlistSchema,
} from '../schemas';

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

  // Shapes from upstream 1.51.0's routers, with made-up values.
  it('parses sets with owned counts', () => {
    const [set] = SetsSchema.parse([
      {
        id: 'xy1_en',
        tcg_set_id: 'xy1',
        name: 'XY',
        series: 'XY',
        release_date: '2014-02-05',
        total: 146,
        printed_total: 146,
        images_symbol: null,
        images_logo: null,
        abbreviation: 'XY',
        is_new: false,
        is_digital: false,
        lang: 'en',
        owned_count: 12,
      },
    ]);
    expect(set?.owned_count).toBe(12);
  });

  it('parses a set checklist', () => {
    const parsed = ChecklistSchema.parse({
      set: { id: 'xy1_en', name: 'XY', series: 'XY', total: 146, lang: 'en' },
      cards: [{ ...card, owned: true, owned_quantity: 2, wishlisted: false, owned_items: [] }],
      owned_count: 1,
      total_count: 146,
      progress: 0.7,
    });
    expect(parsed.cards[0]?.owned_quantity).toBe(2);
  });

  it('parses a binder with its cards', () => {
    const parsed = BinderCardsSchema.parse({
      binder: { id: 4, name: 'Trade binder', color: '#EE1515', binder_type: 'collection' },
      cards: [
        {
          id: card.id,
          binder_card_id: 90,
          name: card.name,
          set_id: 'xy1',
          set_name: 'XY',
          number: '1',
          rarity: card.rarity,
          images_small: card.images_small,
          images_large: card.images_large,
          price_market: 3.5,
          in_collection: true,
          owned: true,
          required_quantity: 1,
          owned_quantity: 1,
          missing_quantity: 0,
          variant: 'Holo',
          condition: 'NM',
          card: { id: card.id, name: card.name },
        },
      ],
      owned_count: 1,
      total_count: 1,
      missing_count: 0,
      binder_value: 3.5,
      current_value: 3.5,
      cost_to_complete: 0,
    });
    expect(parsed.cards[0]?.binder_card_id).toBe(90);
  });

  it('parses a wishlist with its cards', () => {
    const [item] = WishlistSchema.parse([
      {
        id: 3,
        card_id: card.id,
        quantity: 1,
        price_alert_above: null,
        price_alert_below: null,
        notified_at: null,
        created_at: '2026-09-01T10:00:00',
        card: { ...card, set_ref: { id: 'xy1_en', name: 'XY' } },
      },
    ]);
    expect(item?.card?.set_ref?.name).toBe('XY');
  });
});
