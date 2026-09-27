import type { PokeCollectorClient } from './client';
import {
  AuthModeSchema,
  CardSchema,
  CollectionItemSchema,
  CollectionSchema,
  DashboardSchema,
  SearchResponseSchema,
  UserSchema,
  WishlistItemSchema,
  type AuthMode,
  type Card,
  type CollectionItem,
  type Condition,
  type Dashboard,
  type SearchResponse,
  type User,
  type Variant,
} from './schemas';

export function getAuthMode(
  client: PokeCollectorClient,
  options: { timeoutMs?: number } = {},
): Promise<AuthMode> {
  return client.requestAnonymous('/api/auth/mode', { schema: AuthModeSchema, ...options });
}

export function getMe(client: PokeCollectorClient): Promise<User> {
  return client.request('/api/auth/me', { schema: UserSchema });
}

export function getDashboard(client: PokeCollectorClient): Promise<Dashboard> {
  return client.request('/api/dashboard/', { schema: DashboardSchema });
}

/** The whole collection in one response; upstream does not paginate it. */
export function getCollection(client: PokeCollectorClient): Promise<CollectionItem[]> {
  return client.request('/api/collection/', { schema: CollectionSchema });
}

export function getCard(client: PokeCollectorClient, id: string): Promise<Card> {
  return client.request(`/api/cards/${encodeURIComponent(id)}`, { schema: CardSchema });
}

export interface SearchParams {
  q: string;
  page: number;
  pageSize?: number;
}

export function searchCards(
  client: PokeCollectorClient,
  { q, page, pageSize = 30 }: SearchParams,
): Promise<SearchResponse> {
  return client.request('/api/cards/search', {
    schema: SearchResponseSchema,
    query: { q, page, page_size: pageSize },
  });
}

export interface NewCollectionItem {
  card_id: string;
  quantity: number;
  variant: Variant;
  condition: Condition;
}

/**
 * Adds copies. Upstream merges into an existing entry with the same card,
 * variant, condition and language, so this is also "add one more".
 */
export function addToCollection(
  client: PokeCollectorClient,
  item: NewCollectionItem,
): Promise<CollectionItem> {
  return client.request('/api/collection/', {
    method: 'POST',
    json: item,
    schema: CollectionItemSchema,
  });
}

/** Quantity must stay at 1 or more; use removeFromCollection for 0. */
export function updateCollectionItem(
  client: PokeCollectorClient,
  id: number,
  patch: { quantity?: number; condition?: Condition; variant?: Variant },
): Promise<CollectionItem> {
  return client.request(`/api/collection/${id}`, {
    method: 'PUT',
    json: patch,
    schema: CollectionItemSchema,
  });
}

export function removeFromCollection(client: PokeCollectorClient, id: number): Promise<unknown> {
  return client.request(`/api/collection/${id}`, { method: 'DELETE' });
}

/** Adds to the wishlist; upstream adds to the quantity if the card is already there. */
export function addToWishlist(client: PokeCollectorClient, cardId: string): Promise<unknown> {
  return client.request('/api/wishlist/', {
    method: 'POST',
    json: { card_id: cardId, quantity: 1 },
    schema: WishlistItemSchema,
  });
}
