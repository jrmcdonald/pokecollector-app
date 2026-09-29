/**
 * Every server read and write the screens use, as TanStack Query hooks.
 *
 * Keys start with the session's opaque cacheId, so one account's cached data
 * is never shown to another, and the key says nothing about the server.
 * Query functions read the client through getClient() at call time rather
 * than capturing it (see SessionContextValue.getClient).
 */
import {
  onlineManager,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useSyncExternalStore } from 'react';

import { batchPollDelay } from '@/api/batch';
import { addDeckToCollection, importDecklist } from '@/api/decks';
import {
  addCardToPlannedBinder,
  addCollectionItemToBinder,
  addDeckEntry,
  addToCollection,
  addToWishlist,
  createScanJob,
  deleteDeck,
  deleteScanJob,
  dismissScanItem,
  getBinderCards,
  getBinders,
  getCard,
  getCollection,
  getDashboard,
  getDeck,
  getDecks,
  getPrintingDetailTags,
  getScanJob,
  getSetChecklist,
  getSets,
  getWishlist,
  listScanJobs,
  removeBinderEntry,
  removeFromCollection,
  removeFromWishlist,
  resolveAndAddScan,
  retryScanItem,
  searchCards,
  updateCollectionItem,
  type NewCollectionItem,
} from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import type {
  BinderCards,
  CollectionItem,
  Deck,
  ScanItem,
  ScanJob,
  WishlistItem,
} from '@/api/schemas';
import { useSession } from '@/session/session';
import { forgetBatchPhotos, keepBatchPhotos, pruneBatchPhotos } from '@/utils/batch-photos';
import type { DeckLine } from '@/utils/decklist';
import { showToast } from '@/utils/toast';

const SEARCH_PAGE_SIZE = 30;

export function useKeys() {
  const { session, getClient } = useSession();
  const cacheId = session.status === 'signedIn' ? session.cacheId : null;
  return {
    enabled: cacheId !== null,
    cacheId,
    getClient,
    keys: {
      all: [cacheId] as const,
      dashboard: [cacheId, 'dashboard'] as const,
      collection: [cacheId, 'collection'] as const,
      card: (id: string) => [cacheId, 'card', id] as const,
      search: (q: string) => [cacheId, 'search', q] as const,
      searchAll: [cacheId, 'search'] as const,
      wishlist: [cacheId, 'wishlist'] as const,
      sets: [cacheId, 'sets'] as const,
      checklist: (setId: string) => [cacheId, 'checklist', setId] as const,
      checklistAll: [cacheId, 'checklist'] as const,
      binders: [cacheId, 'binders'] as const,
      binder: (id: number) => [cacheId, 'binder', id] as const,
      binderAll: [cacheId, 'binder'] as const,
      decks: [cacheId, 'decks'] as const,
      deck: (id: number) => [cacheId, 'deck', id] as const,
      deckAll: [cacheId, 'deck'] as const,
      printingDetails: [cacheId, 'printing-details'] as const,
      scanJobs: [cacheId, 'scan-jobs'] as const,
      scanJob: (id: number) => [cacheId, 'scan-job', id] as const,
    },
  };
}

export function useDashboard() {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => getDashboard(getClient()),
    enabled,
  });
}

export function useCollection() {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.collection,
    queryFn: () => getCollection(getClient()),
    enabled,
  });
}

export function useCard(id: string) {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.card(id),
    queryFn: () => getCard(getClient(), id),
    enabled: enabled && id.length > 0,
    // Catalogue data changes with the nightly price sync at most.
    staleTime: 60 * 60 * 1000,
  });
}

/** Catalogue search, a page at a time. `q` should already be debounced. */
export function useCardSearch(q: string) {
  const { enabled, getClient, keys } = useKeys();
  const term = q.trim();
  return useInfiniteQuery({
    queryKey: keys.search(term),
    queryFn: ({ pageParam }) =>
      searchCards(getClient(), { q: term, page: pageParam, pageSize: SEARCH_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total_count ? last.page + 1 : undefined,
    enabled: enabled && term.length >= 2,
    // Owned counts in results change as the collection does; keep them fresh
    // for a short while only, but do not refetch on every keystroke-return.
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function usePrintingDetailTags() {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.printingDetails,
    queryFn: () => getPrintingDetailTags(getClient()),
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}

export function useWishlist() {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.wishlist,
    queryFn: () => getWishlist(getClient()),
    enabled,
  });
}

export function useSets() {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.sets,
    queryFn: () => getSets(getClient()),
    enabled,
    // New sets arrive a few times a year; owned counts are refreshed by
    // invalidation whenever the collection changes.
    staleTime: 60 * 60 * 1000,
  });
}

export function useSetChecklist(setId: string) {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.checklist(setId),
    queryFn: () => getSetChecklist(getClient(), setId),
    enabled: enabled && setId.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}

export function useBinders() {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.binders,
    queryFn: () => getBinders(getClient()),
    enabled,
  });
}

export function useBinderCards(id: number) {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.binder(id),
    queryFn: () => getBinderCards(getClient(), id),
    enabled: enabled && Number.isInteger(id) && id > 0,
  });
}

/**
 * Refetches what a change to the collection affects. Only screens on show
 * refetch straight away; the rest are marked stale and refetch when opened.
 */
export function useInvalidateOwnership() {
  const queryClient = useQueryClient();
  const { keys } = useKeys();
  return () =>
    Promise.all(
      [
        keys.collection,
        keys.dashboard,
        keys.searchAll,
        keys.sets,
        keys.checklistAll,
        keys.binders,
        keys.binderAll,
        keys.decks,
        keys.deckAll,
        keys.printingDetails,
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

/** A success tap. Never allowed to fail the mutation it follows. */
export function succeeded() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function reportFailure(title: string, error: unknown) {
  showToast({
    kind: 'error',
    title,
    message: error instanceof ApiError ? error.message : 'Something went wrong. Try again.',
  });
}

/**
 * Sets how many copies an entry has; 0 removes it. Optimistic: the list
 * changes at once and goes back if the server says no.
 */
export function useSetQuantity() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  const invalidate = useInvalidateOwnership();
  return useMutation({
    mutationFn: ({ item, quantity }: { item: CollectionItem; quantity: number }) =>
      quantity > 0
        ? updateCollectionItem(getClient(), item.id, { quantity })
        : removeFromCollection(getClient(), item.id),
    onMutate: async ({ item, quantity }) => {
      await queryClient.cancelQueries({ queryKey: keys.collection });
      const previous = queryClient.getQueryData<CollectionItem[]>(keys.collection);
      queryClient.setQueryData<CollectionItem[]>(keys.collection, (items) =>
        applyQuantity(items, item.id, quantity),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(keys.collection, context.previous);
      reportFailure('Could not update the quantity', error);
    },
    onSettled: invalidate,
  });
}

/** The collection with one entry's quantity changed, or the entry gone at 0. */
export function applyQuantity(
  items: CollectionItem[] | undefined,
  id: number,
  quantity: number,
): CollectionItem[] | undefined {
  if (!items) return items;
  return quantity > 0
    ? items.map((entry) => (entry.id === id ? { ...entry, quantity } : entry))
    : items.filter((entry) => entry.id !== id);
}

/** Changes a copy's variant, condition or printing details. Not optimistic: upstream may merge rows. */
export function useUpdateCopy() {
  const { getClient } = useKeys();
  const invalidate = useInvalidateOwnership();
  return useMutation({
    mutationFn: ({
      item,
      patch,
    }: {
      item: CollectionItem;
      patch: Parameters<typeof updateCollectionItem>[2];
    }) => updateCollectionItem(getClient(), item.id, patch),
    onSuccess: succeeded,
    onError: (error) => reportFailure('Could not change the copy', error),
    onSettled: invalidate,
  });
}

export function useAddToCollection() {
  const { getClient } = useKeys();
  const invalidate = useInvalidateOwnership();
  return useMutation({
    mutationFn: (item: NewCollectionItem) => addToCollection(getClient(), item),
    onError: (error) => reportFailure('Could not add the card', error),
    onSettled: invalidate,
  });
}

/** Adds a scanned card as its confirmed candidate, and marks the scan handled. */
export function useAddFromScan() {
  const { getClient } = useKeys();
  const invalidate = useInvalidateOwnership();
  return useMutation({
    mutationFn: ({
      jobId,
      itemId,
      add,
    }: {
      jobId: number;
      itemId: number;
      add: Parameters<typeof resolveAndAddScan>[3];
    }) => resolveAndAddScan(getClient(), jobId, itemId, add),
    onSuccess: succeeded,
    onError: (error) => reportFailure('Could not add the card', error),
    onSettled: invalidate,
  });
}

export function useAddToWishlist() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  return useMutation({
    mutationFn: (cardId: string) => addToWishlist(getClient(), cardId),
    onSuccess: succeeded,
    onError: (error) => reportFailure('Could not add to the wishlist', error),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.wishlist }),
        queryClient.invalidateQueries({ queryKey: keys.searchAll }),
        queryClient.invalidateQueries({ queryKey: keys.checklistAll }),
      ]),
  });
}

/** Optimistic: the row goes at once and comes back if the server says no. */
export function useRemoveFromWishlist() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  return useMutation({
    mutationFn: (item: WishlistItem) => removeFromWishlist(getClient(), item.id),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: keys.wishlist });
      const previous = queryClient.getQueryData<WishlistItem[]>(keys.wishlist);
      queryClient.setQueryData<WishlistItem[]>(keys.wishlist, (items) =>
        items?.filter((entry) => entry.id !== item.id),
      );
      return { previous };
    },
    onError: (error, _item, context) => {
      if (context?.previous) queryClient.setQueryData(keys.wishlist, context.previous);
      reportFailure('Could not remove it from the wishlist', error);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.wishlist }),
        queryClient.invalidateQueries({ queryKey: keys.searchAll }),
        queryClient.invalidateQueries({ queryKey: keys.checklistAll }),
      ]),
  });
}

/**
 * What to put in a binder. A collection binder takes one exact owned copy; a
 * planned binder takes the card itself, owned or not.
 */
export type BinderAddition =
  { binderId: number; collectionItemId: number } | { binderId: number; cardId: string };

export function useAddToBinder() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  return useMutation({
    mutationFn: (addition: BinderAddition) =>
      'collectionItemId' in addition
        ? addCollectionItemToBinder(getClient(), addition.binderId, addition.collectionItemId)
        : addCardToPlannedBinder(getClient(), addition.binderId, addition.cardId),
    onSuccess: succeeded,
    onError: (error) => reportFailure('Could not add it to the binder', error),
    onSettled: (_data, _error, addition) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.binders }),
        queryClient.invalidateQueries({ queryKey: keys.binder(addition.binderId) }),
      ]),
  });
}

/** Optimistic, like the wishlist. */
export function useRemoveFromBinder() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  return useMutation({
    mutationFn: ({ binderId, binderCardId }: { binderId: number; binderCardId: number }) =>
      removeBinderEntry(getClient(), binderId, binderCardId),
    onMutate: async ({ binderId, binderCardId }) => {
      await queryClient.cancelQueries({ queryKey: keys.binder(binderId) });
      const previous = queryClient.getQueryData<BinderCards>(keys.binder(binderId));
      queryClient.setQueryData<BinderCards>(keys.binder(binderId), (data) =>
        data
          ? { ...data, cards: data.cards.filter((c) => c.binder_card_id !== binderCardId) }
          : data,
      );
      return { previous };
    },
    onError: (error, { binderId }, context) => {
      if (context?.previous) queryClient.setQueryData(keys.binder(binderId), context.previous);
      reportFailure('Could not remove it from the binder', error);
    },
    onSettled: (_data, _error, { binderId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.binders }),
        queryClient.invalidateQueries({ queryKey: keys.binder(binderId) }),
      ]),
  });
}

/** Whether the phone has a connection, as TanStack Query sees it (NetInfo-backed). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  );
}

/**
 * The scan inbox: jobs with photos still to review. `poll` keeps it fresh
 * every 10 s while any of them is still being read, for the screen that
 * lists them; elsewhere it refreshes only when stale or changed.
 */
export function useScanJobs({
  poll = false,
  subscribed = true,
}: {
  poll?: boolean;
  /** False while its screen is out of sight; coming back refetches it if stale. */
  subscribed?: boolean;
} = {}) {
  const { enabled, cacheId, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.scanJobs,
    queryFn: async () => {
      const jobs = await listScanJobs(getClient());
      if (cacheId)
        pruneBatchPhotos(
          cacheId,
          jobs.map((job) => job.id),
        );
      return jobs;
    },
    enabled,
    subscribed,
    staleTime: 60 * 1000,
    refetchInterval: (query) =>
      poll && query.state.data?.some((job) => (job.active ?? 0) > 0) ? 10_000 : false,
  });
}

/** Photos waiting for review across the inbox, for the Scan tab's count. */
export function reviewCount(jobs: readonly ScanJob[] | undefined): number {
  return (jobs ?? []).reduce((sum, job) => sum + (job.attention ?? 0), 0);
}

/**
 * One job with every item, polled while upstream is still reading: every
 * 3 s at first, easing to 10 s (see batchPollDelay). One poll covers the
 * whole batch.
 */
export function useScanJob(id: number) {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.scanJob(id),
    queryFn: () => getScanJob(getClient(), id),
    enabled: enabled && Number.isInteger(id) && id > 0,
    staleTime: 15 * 1000,
    refetchInterval: (query) =>
      batchPollDelay(query.state.dataUpdateCount, query.state.data, Date.now()),
  });
}

/** Writes one item of a cached job, as a change upstream would. */
export function useUpdateScanItem() {
  const queryClient = useQueryClient();
  const { keys } = useKeys();
  return (jobId: number, itemId: number, change: (item: ScanItem) => ScanItem) =>
    queryClient.setQueryData<ScanJob>(keys.scanJob(jobId), (job) =>
      job?.items
        ? { ...job, items: job.items.map((item) => (item.id === itemId ? change(item) : item)) }
        : job,
    );
}

/**
 * Sends a batch of photos as one job. The phone keeps its copies for the
 * review's thumbnails; upstream's are only fetched when one is opened.
 */
export function useStartBatch() {
  const queryClient = useQueryClient();
  const { cacheId, getClient, keys } = useKeys();
  return useMutation({
    mutationFn: async (photos: File[]) => {
      const job = await createScanJob(getClient(), photos);
      if (cacheId) await keepBatchPhotos(cacheId, job.id, photos);
      return job;
    },
    onError: (error) => reportFailure('Could not send the photos', error),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.scanJobs }),
  });
}

/** Skips a photo: marks it handled upstream without adding anything. */
export function useDismissScanItem() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  const update = useUpdateScanItem();
  return useMutation({
    mutationFn: ({ jobId, itemId }: { jobId: number; itemId: number }) =>
      dismissScanItem(getClient(), jobId, itemId),
    onSuccess: (_item, { jobId, itemId }) =>
      update(jobId, itemId, (item) => ({ ...item, resolved: true, has_image: false })),
    onError: (error) => reportFailure('Could not skip the photo', error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.scanJobs }),
  });
}

/** Asks upstream to read a failed photo again; the job polls until it has. */
export function useRetryScanItem() {
  const { getClient } = useKeys();
  const update = useUpdateScanItem();
  return useMutation({
    mutationFn: ({ jobId, itemId }: { jobId: number; itemId: number }) =>
      retryScanItem(getClient(), jobId, itemId),
    onSuccess: (item, { jobId, itemId }) => update(jobId, itemId, (old) => ({ ...old, ...item })),
    onError: (error) => reportFailure('Could not try the photo again', error),
  });
}

/** Deletes a whole job, and its photos, upstream and on the phone. */
export function useDiscardScanJob() {
  const queryClient = useQueryClient();
  const { cacheId, getClient, keys } = useKeys();
  return useMutation({
    mutationFn: (jobId: number) => deleteScanJob(getClient(), jobId),
    onSuccess: (_result, jobId) => {
      if (cacheId) forgetBatchPhotos(cacheId, jobId);
      queryClient.removeQueries({ queryKey: keys.scanJob(jobId) });
    },
    onError: (error) => reportFailure('Could not discard the scans', error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.scanJobs }),
  });
}

export function useDecks() {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.decks,
    queryFn: () => getDecks(getClient()),
    enabled,
  });
}

export function useDeck(id: number) {
  const { enabled, getClient, keys } = useKeys();
  return useQuery({
    queryKey: keys.deck(id),
    queryFn: () => getDeck(getClient(), id),
    enabled: enabled && Number.isInteger(id) && id > 0,
  });
}

/** The CSV upstream's import reads, as a file FormData can send. */
function csvFile(csv: string): File {
  const file = new File(Paths.cache, 'deck-import.csv');
  file.create({ overwrite: true });
  file.write(csv);
  return file;
}

/**
 * Makes a planned deck from a pasted list: the preview the user confirms.
 * The catalogue language is the one the account's sets are in.
 */
export function useImportDecklist() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  const sets = useSets();
  return useMutation({
    mutationFn: ({ name, cards }: { name: string; cards: readonly DeckLine[] }) =>
      importDecklist(getClient(), {
        name,
        cards,
        lang: sets.data?.[0]?.lang ?? 'en',
        toFile: csvFile,
      }),
    onSuccess: ({ deck }) => queryClient.setQueryData(keys.deck(deck.id), deck),
    onError: (error) => reportFailure('Could not read the deck list', error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.decks }),
  });
}

/** Adds a card the import could not find, once the user has found it. */
export function useAddDeckEntry() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  return useMutation({
    mutationFn: ({
      deckId,
      cardId,
      quantity,
    }: {
      deckId: number;
      cardId: string;
      quantity: number;
    }) => addDeckEntry(getClient(), deckId, { card_id: cardId, required_quantity: quantity }),
    onSuccess: (deck) => queryClient.setQueryData(keys.deck(deck.id), deck),
    onError: (error) => reportFailure('Could not add the card to the deck', error),
  });
}

/** Adds every copy of a planned deck to the collection and makes it a Real Deck. */
export function useAddDeckToCollection() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  const invalidate = useInvalidateOwnership();
  return useMutation({
    mutationFn: (deck: Deck) => addDeckToCollection(getClient(), deck),
    onSuccess: ({ deck }) => {
      succeeded();
      queryClient.setQueryData(keys.deck(deck.id), deck);
    },
    onError: (error) => reportFailure('Could not add the deck', error),
    onSettled: invalidate,
  });
}

export function useDeleteDeck() {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  return useMutation({
    mutationFn: (deckId: number) => deleteDeck(getClient(), deckId),
    onSuccess: (_result, deckId) => queryClient.removeQueries({ queryKey: keys.deck(deckId) }),
    onError: (error) => reportFailure('Could not delete the deck', error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.decks }),
  });
}
