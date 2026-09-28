import type { PokeCollectorClient } from './client';
import {
  AuthModeSchema,
  BinderCardsSchema,
  BindersSchema,
  CardSchema,
  ChecklistSchema,
  CollectionItemSchema,
  CollectionSchema,
  DashboardSchema,
  PrintingDetailTagsSchema,
  ResolveAndAddSchema,
  ScanItemSchema,
  ScanJobSchema,
  SearchResponseSchema,
  SetsSchema,
  UserSchema,
  WishlistItemSchema,
  WishlistSchema,
  type AuthMode,
  type Binder,
  type BinderCards,
  type Card,
  type CardSet,
  type Checklist,
  type ScanItem,
  type ScanJob,
  type CollectionItem,
  type Condition,
  type Dashboard,
  type PrintingDetailTag,
  type SearchResponse,
  type User,
  type Variant,
  type WishlistItem,
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
  /** Printing detail names; a new name creates the tag upstream. */
  printing_details?: string[];
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
  patch: {
    quantity?: number;
    condition?: Condition;
    variant?: Variant;
    printing_details?: string[];
  },
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

export function getWishlist(client: PokeCollectorClient): Promise<WishlistItem[]> {
  return client.request('/api/wishlist/', { schema: WishlistSchema });
}

export function removeFromWishlist(client: PokeCollectorClient, id: number): Promise<unknown> {
  return client.request(`/api/wishlist/${id}`, { method: 'DELETE' });
}

/** Every set in the account's catalogue language, newest first. */
export function getSets(client: PokeCollectorClient): Promise<CardSet[]> {
  return client.request('/api/sets/', { schema: SetsSchema });
}

/**
 * A set's cards with what this account owns of each. Upstream may fetch the
 * set from TCGdex the first time, so this can be slow once.
 */
export function getSetChecklist(client: PokeCollectorClient, setId: string): Promise<Checklist> {
  return client.request(`/api/sets/${encodeURIComponent(setId)}/checklist`, {
    schema: ChecklistSchema,
    timeoutMs: 60_000,
  });
}

/** Binders and decks together; the screens filter decks out. */
export function getBinders(client: PokeCollectorClient): Promise<Binder[]> {
  return client.request('/api/binders/', { schema: BindersSchema });
}

export function getBinderCards(
  client: PokeCollectorClient,
  binderId: number,
): Promise<BinderCards> {
  return client.request(`/api/binders/${binderId}/cards`, { schema: BinderCardsSchema });
}

/** Puts one owned copy (an exact collection entry) into a collection binder. */
export function addCollectionItemToBinder(
  client: PokeCollectorClient,
  binderId: number,
  collectionItemId: number,
): Promise<unknown> {
  return client.request(`/api/binders/${binderId}/collection-items`, {
    method: 'POST',
    query: { collection_item_id: collectionItemId, quantity: 1 },
  });
}

/** Plans a card in a planned ("wishlist") binder, owned or not. */
export function addCardToPlannedBinder(
  client: PokeCollectorClient,
  binderId: number,
  cardId: string,
): Promise<unknown> {
  return client.request(`/api/binders/${binderId}/cards`, {
    method: 'POST',
    query: { card_id: cardId, required_quantity: 1 },
  });
}

export function removeBinderEntry(
  client: PokeCollectorClient,
  binderId: number,
  binderCardId: number,
): Promise<unknown> {
  return client.request(`/api/binders/${binderId}/entries/${binderCardId}`, { method: 'DELETE' });
}

/**
 * Uploads one photo as a scan job and returns straight away; recognition
 * runs in the background upstream. `photo` is anything FormData can send
 * as a file: in the app, an expo-file-system File.
 */
export function createScanJob(client: PokeCollectorClient, photo: Blob): Promise<ScanJob> {
  const form = new FormData();
  form.append('files', photo);
  return client.request('/api/cards/recognize/jobs', {
    method: 'POST',
    form,
    schema: ScanJobSchema,
    // A photo over a slow uplink, through the tunnel.
    timeoutMs: 60_000,
  });
}

export function getScanJob(client: PokeCollectorClient, jobId: number): Promise<ScanJob> {
  return client.request(`/api/cards/recognize/jobs/${jobId}`, { schema: ScanJobSchema });
}

/**
 * Adds the confirmed candidate and marks the scan handled, atomically;
 * upstream makes a repeat of the same request a no-op rather than a second
 * copy.
 */
export function resolveAndAddScan(
  client: PokeCollectorClient,
  jobId: number,
  itemId: number,
  add: NewCollectionItem & { confirmedCardId: string; lang: string },
): Promise<unknown> {
  const { confirmedCardId, ...item } = add;
  return client.request(`/api/cards/recognize/jobs/${jobId}/items/${itemId}/resolve-and-add`, {
    method: 'POST',
    json: { ...item, confirmed_card_id: confirmedCardId },
    schema: ResolveAndAddSchema,
  });
}

/** Asks upstream to recognize a failed item again. */
export function retryScanItem(
  client: PokeCollectorClient,
  jobId: number,
  itemId: number,
): Promise<ScanItem> {
  return client.request(`/api/cards/recognize/jobs/${jobId}/items/${itemId}/retry`, {
    method: 'POST',
    schema: ScanItemSchema,
  });
}

/** Drops a job and its photo, when the scan is abandoned or dismissed. */
export function deleteScanJob(client: PokeCollectorClient, jobId: number): Promise<unknown> {
  return client.request(`/api/cards/recognize/jobs/${jobId}`, { method: 'DELETE' });
}

export function getPrintingDetailTags(client: PokeCollectorClient): Promise<PrintingDetailTag[]> {
  return client.request('/api/collection/printing-detail-tags', {
    schema: PrintingDetailTagsSchema,
  });
}
