/**
 * Runtime checks for the fields the app reads.
 *
 * `generated.ts` is the full description of each endpoint, from upstream's
 * OpenAPI spec. Several endpoints return untyped dicts there (`/api/auth/me`
 * among them), and nothing stops upstream changing a field between releases,
 * so what the app actually depends on is checked here. Objects are loose on
 * purpose: new upstream fields must not break the app.
 */
import { z } from 'zod';

import type { components } from './generated';

export type Schemas = components['schemas'];

export const UserSchema = z.looseObject({
  id: z.number(),
  username: z.string(),
  role: z.string(),
  must_change_password: z.boolean().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const TokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  user: UserSchema,
});

/** GET /api/auth/mode — answerable without a login, so it proves Access alone. */
export const AuthModeSchema = z.looseObject({
  multi_user: z.boolean(),
  locked: z.boolean().optional(),
});
export type AuthMode = z.infer<typeof AuthModeSchema>;

// ---------------------------------------------------------------------------
// Cards, collection and dashboard. Checked against a live 1.51.0 server; the
// `nullish` fields are ones upstream sends as null, omits, or both.
// ---------------------------------------------------------------------------

const price = z.number().nullish();

export const SetRefSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  abbreviation: z.string().nullish(),
  lang: z.string().nullish(),
});
export type SetRef = z.infer<typeof SetRefSchema>;

export const CardSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  set_id: z.string().nullish(),
  number: z.string().nullish(),
  rarity: z.string().nullish(),
  supertype: z.string().nullish(),
  types: z.array(z.string()).nullish(),
  hp: z.string().nullish(),
  artist: z.string().nullish(),
  images_small: z.string().nullish(),
  images_large: z.string().nullish(),
  custom_image_url: z.string().nullish(),
  is_custom: z.boolean().nullish(),
  set_ref: SetRefSchema.nullish(),
  price_market: price,
  price_trend: price,
  price_low: price,
  price_avg1: price,
  price_avg7: price,
  price_avg30: price,
  price_market_holo: price,
  price_trend_holo: price,
  price_low_holo: price,
  price_avg30_holo: price,
  variants_normal: z.boolean().nullish(),
  variants_reverse: z.boolean().nullish(),
  variants_holo: z.boolean().nullish(),
  variants_first_edition: z.boolean().nullish(),
});
export type Card = z.infer<typeof CardSchema>;

/** A search result: a catalogue card plus what this account owns of it. */
export const SearchCardSchema = CardSchema.extend({
  owned: z.boolean().nullish(),
  owned_quantity: z.number().nullish(),
  wishlisted: z.boolean().nullish(),
});
export type SearchCard = z.infer<typeof SearchCardSchema>;

export const SearchResponseSchema = z.looseObject({
  data: z.array(SearchCardSchema),
  total_count: z.number(),
  page: z.number(),
  page_size: z.number(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/** Upstream's CollectionVariant enum. */
export const VARIANTS = ['Normal', 'Holo', 'Reverse Holo', 'First Edition'] as const;
export type Variant = (typeof VARIANTS)[number];

/** Upstream's ALLOWED_CONDITIONS, best first. */
export const CONDITIONS = ['Mint', 'NM', 'LP', 'MP', 'HP'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CollectionItemSchema = z.looseObject({
  id: z.number(),
  card_id: z.string(),
  quantity: z.number(),
  // Strings rather than enums: an unknown value from a newer upstream must not
  // throw away the whole collection.
  condition: z.string(),
  variant: z.string().nullish(),
  lang: z.string().nullish(),
  added_at: z.string().nullish(),
  purchase_price: price,
  card: CardSchema.nullish(),
});
export type CollectionItem = z.infer<typeof CollectionItemSchema>;

export const CollectionSchema = z.array(CollectionItemSchema);

const DashboardCardSchema = z.looseObject({
  collection_item_id: z.number().nullish(),
  card_id: z.string(),
  name: z.string(),
  images_small: z.string().nullish(),
  images_large: z.string().nullish(),
  custom_image_url: z.string().nullish(),
  quantity: z.number().nullish(),
  variant: z.string().nullish(),
  added_at: z.string().nullish(),
  price_market: price,
});
export type DashboardCard = z.infer<typeof DashboardCardSchema>;

export const DashboardSchema = z.looseObject({
  total_cards: z.number(),
  unique_cards: z.number(),
  total_value: z.number(),
  total_cost: z.number().nullish(),
  pnl: z.number().nullish(),
  total_sets: z.number().nullish(),
  owned_sets: z.number().nullish(),
  recent_additions: z.array(DashboardCardSchema),
  top_cards: z.array(DashboardCardSchema).nullish(),
  price_field: z.string().nullish(),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

// ---------------------------------------------------------------------------
// Wishlist, sets and binders. Shapes follow upstream 1.51.0's routers
// (`api/wishlist.py`, `api/sets.py`, `api/binders.py`); the checklist and
// binder cards are untyped dicts in the spec.
// ---------------------------------------------------------------------------

export const WishlistItemSchema = z.looseObject({
  id: z.number(),
  card_id: z.string(),
  quantity: z.number(),
  created_at: z.string().nullish(),
  card: CardSchema.nullish(),
});
export type WishlistItem = z.infer<typeof WishlistItemSchema>;

export const WishlistSchema = z.array(WishlistItemSchema);

/** GET /api/sets/: every visible set, with how many of its cards this account owns. */
export const SetSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  series: z.string().nullish(),
  release_date: z.string().nullish(),
  total: z.number().nullish(),
  printed_total: z.number().nullish(),
  images_symbol: z.string().nullish(),
  images_logo: z.string().nullish(),
  abbreviation: z.string().nullish(),
  lang: z.string().nullish(),
  owned_count: z.number().nullish(),
});
export type CardSet = z.infer<typeof SetSchema>;

export const SetsSchema = z.array(SetSchema);

export const ChecklistCardSchema = CardSchema.extend({
  owned: z.boolean().nullish(),
  owned_quantity: z.number().nullish(),
  wishlisted: z.boolean().nullish(),
});
export type ChecklistCard = z.infer<typeof ChecklistCardSchema>;

/** GET /api/sets/{id}/checklist: every card in the set, owned or not, in number order. */
export const ChecklistSchema = z.looseObject({
  set: z.looseObject({
    id: z.string(),
    name: z.string(),
    total: z.number().nullish(),
  }),
  cards: z.array(ChecklistCardSchema),
  owned_count: z.number(),
  total_count: z.number(),
  progress: z.number().nullish(),
});
export type Checklist = z.infer<typeof ChecklistSchema>;

/**
 * Upstream's binder types. A "collection" binder holds exact collection
 * entries, so it only ever shows owned cards; a "wishlist" (planned) binder
 * lists cards to collect, owned or not. Decks share the endpoint and are
 * left out of the Binders screen.
 */
export const DECK_TYPES = ['deck', 'physical_deck'] as const;

export const BinderSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  description: z.string().nullish(),
  color: z.string().nullish(),
  binder_type: z.string().nullish(),
  card_count: z.number().nullish(),
  unique_card_count: z.number().nullish(),
});
export type Binder = z.infer<typeof BinderSchema>;

export const BindersSchema = z.array(BinderSchema);

export const BinderCardSchema = z.looseObject({
  /** The catalogue card's id. */
  id: z.string(),
  /** This entry's id in the binder, for removing it. */
  binder_card_id: z.number(),
  name: z.string(),
  set_id: z.string().nullish(),
  set_name: z.string().nullish(),
  number: z.string().nullish(),
  rarity: z.string().nullish(),
  images_small: z.string().nullish(),
  images_large: z.string().nullish(),
  price_market: price,
  owned: z.boolean().nullish(),
  required_quantity: z.number().nullish(),
  owned_quantity: z.number().nullish(),
  missing_quantity: z.number().nullish(),
  variant: z.string().nullish(),
  condition: z.string().nullish(),
});
export type BinderCard = z.infer<typeof BinderCardSchema>;

export const BinderCardsSchema = z.looseObject({
  binder: BinderSchema,
  cards: z.array(BinderCardSchema),
  owned_count: z.number().nullish(),
  total_count: z.number().nullish(),
  missing_count: z.number().nullish(),
  binder_value: z.number().nullish(),
  current_value: z.number().nullish(),
  cost_to_complete: z.number().nullish(),
});
export type BinderCards = z.infer<typeof BinderCardsSchema>;
