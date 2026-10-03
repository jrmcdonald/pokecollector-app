import type { PokeCollectorClient } from './client';
import {
  AuthModeSchema,
  BinderCardsSchema,
  BindersSchema,
  BulkAddResultSchema,
  CardSchema,
  ChecklistSchema,
  CollectionItemSchema,
  CollectionSchema,
  DashboardSchema,
  DeckSchema,
  DecksSchema,
  ImportResultSchema,
  PrintingDetailTagsSchema,
  ResolveAndAddSchema,
  ScanItemSchema,
  ScanJobListSchema,
  ScanJobSchema,
  SearchResponseSchema,
  SetsSchema,
  UserSchema,
  WishlistItemSchema,
  WishlistSchema,
  type AuthMode,
  type Binder,
  type BinderCards,
  type BulkAddResult,
  type Card,
  type CardSet,
  type Checklist,
  type ScanItem,
  type ScanJob,
  type CollectionItem,
  type Condition,
  type Dashboard,
  type Deck,
  type ImportResult,
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
  /** Upstream's own filters, each a substring match; see `utils/search-filters`. */
  filters?: { set_id?: string; rarity?: string; category?: string; type?: string };
}

export function searchCards(
  client: PokeCollectorClient,
  { q, page, pageSize = 30, filters }: SearchParams,
): Promise<SearchResponse> {
  return client.request('/api/cards/search', {
    schema: SearchResponseSchema,
    query: { q, page, page_size: pageSize, ...filters },
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
 * The owner's own photo of a card, shown when the catalogue has no picture.
 * Upstream keeps one per card per account, whichever copy it was sent with,
 * and re-encodes it as a JPEG without its metadata. Up to 12 MB; the app
 * sends a few hundred KB.
 */
export function uploadCollectionPhoto(
  client: PokeCollectorClient,
  itemId: number,
  photo: Blob,
): Promise<unknown> {
  const form = new FormData();
  form.append('file', photo);
  return client.request(`/api/collection/${itemId}/photo`, {
    method: 'POST',
    form,
    timeoutMs: 60_000,
  });
}

/** Removes the owner's photo of the copy's card. The copy stays. */
export function deleteCollectionPhoto(
  client: PokeCollectorClient,
  itemId: number,
): Promise<unknown> {
  return client.request(`/api/collection/${itemId}/photo`, { method: 'DELETE' });
}

/**
 * Uploads photos as one scan job and returns straight away; recognition runs
 * in the background upstream, one item per photo. Each photo is anything
 * FormData can send as a file: in the app, an expo-file-system File. Upstream
 * takes up to 50 photos and 200 MB in a job.
 */
export function createScanJob(
  client: PokeCollectorClient,
  photos: readonly Blob[],
): Promise<ScanJob> {
  const form = new FormData();
  for (const photo of photos) form.append('files', photo);
  return client.request('/api/cards/recognize/jobs', {
    method: 'POST',
    form,
    schema: ScanJobSchema,
    // Photos over a slow uplink, through the tunnel: a minute for one, and
    // more for a batch, which upstream also re-encodes photo by photo.
    timeoutMs: Math.min(5 * 60_000, 60_000 + 6_000 * (photos.length - 1)),
  });
}

/** Jobs with anything still to review, newest first. No items, only counts. */
export async function listScanJobs(client: PokeCollectorClient): Promise<ScanJob[]> {
  return (await client.request('/api/cards/recognize/jobs', { schema: ScanJobListSchema })).jobs;
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

/**
 * Marks one photo handled without adding anything, and deletes the photo
 * upstream: the web UI's "dismiss". Used for a skipped photo, and after a
 * photo's card was added from a search instead of from its candidates.
 */
export function dismissScanItem(
  client: PokeCollectorClient,
  jobId: number,
  itemId: number,
): Promise<ScanItem> {
  return client.request(`/api/cards/recognize/jobs/${jobId}/items/${itemId}/resolve`, {
    method: 'POST',
    json: {},
    schema: ScanItemSchema,
  });
}

/** Drops a job and its photos, when a scan or a whole batch is abandoned. */
export function deleteScanJob(client: PokeCollectorClient, jobId: number): Promise<unknown> {
  return client.request(`/api/cards/recognize/jobs/${jobId}`, { method: 'DELETE' });
}

export function getPrintingDetailTags(client: PokeCollectorClient): Promise<PrintingDetailTag[]> {
  return client.request('/api/collection/printing-detail-tags', {
    schema: PrintingDetailTagsSchema,
  });
}

/**
 * Adds many cards in one request. Upstream commits each on its own and
 * reports the ones that failed, so a bad card does not stop the rest.
 */
export function bulkAddToCollection(
  client: PokeCollectorClient,
  items: readonly (NewCollectionItem & { lang: string })[],
): Promise<BulkAddResult> {
  return client.request('/api/collection/bulk-add', {
    method: 'POST',
    json: { items },
    schema: BulkAddResultSchema,
    timeoutMs: 60_000,
  });
}

/** Every deck, planned and real, without their cards. */
export function getDecks(client: PokeCollectorClient): Promise<Deck[]> {
  return client.request('/api/decks/', { schema: DecksSchema });
}

/** A deck with its cards, and how many of each are owned. */
export function getDeck(client: PokeCollectorClient, deckId: number): Promise<Deck> {
  return client.request(`/api/decks/${deckId}`, { schema: DeckSchema });
}

/** Creates an empty planned deck. */
export function createDeck(
  client: PokeCollectorClient,
  deck: { name: string; target_size?: 20 | 40 | 60 },
): Promise<Deck> {
  return client.request('/api/decks/', {
    method: 'POST',
    json: { format: 'Casual', ...deck },
    schema: DeckSchema,
  });
}

/**
 * Fills a planned deck from a CSV of set codes and numbers (see
 * `deckCsv`). Upstream finds each card, fetching a set from TCGdex if it
 * has not yet, and writes nothing if any row fails. The file must be named
 * `*.csv`.
 */
export function importDeckCsv(
  client: PokeCollectorClient,
  deckId: number,
  file: Blob,
): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  return client.request(`/api/binders/${deckId}/import-csv`, {
    method: 'POST',
    form,
    schema: ImportResultSchema,
    // Sets new to the server are fetched from TCGdex on the way.
    timeoutMs: 90_000,
  });
}

export function addDeckEntry(
  client: PokeCollectorClient,
  deckId: number,
  entry: { card_id: string; required_quantity: number },
): Promise<Deck> {
  return client.request(`/api/decks/${deckId}/entries`, {
    method: 'POST',
    json: entry,
    schema: DeckSchema,
  });
}

/**
 * Makes a planned deck a Real Deck, reserving an owned copy for every card.
 * Upstream refuses (409) unless every copy is owned and not in another deck.
 */
export function convertDeckToReal(client: PokeCollectorClient, deckId: number): Promise<Deck> {
  return client.request(`/api/decks/${deckId}/convert-to-real`, {
    method: 'POST',
    schema: DeckSchema,
  });
}

export function deleteDeck(client: PokeCollectorClient, deckId: number): Promise<unknown> {
  return client.request(`/api/decks/${deckId}`, { method: 'DELETE' });
}
