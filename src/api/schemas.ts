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

export const WishlistItemSchema = z.looseObject({
  id: z.number(),
  card_id: z.string(),
  quantity: z.number(),
});
