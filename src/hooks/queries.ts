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
import * as Haptics from 'expo-haptics';
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import {
  addCardToPlannedBinder,
  addCollectionItemToBinder,
  addToCollection,
  addToWishlist,
  getBinderCards,
  getBinders,
  getCard,
  getCollection,
  getDashboard,
  getSetChecklist,
  getSets,
  getWishlist,
  removeBinderEntry,
  removeFromCollection,
  removeFromWishlist,
  searchCards,
  updateCollectionItem,
  type NewCollectionItem,
} from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import type { BinderCards, CollectionItem, WishlistItem } from '@/api/schemas';
import { useSession } from '@/session/session';

const SEARCH_PAGE_SIZE = 30;

function useKeys() {
  const { session, getClient } = useSession();
  const cacheId = session.status === 'signedIn' ? session.cacheId : null;
  return {
    enabled: cacheId !== null,
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
function useInvalidateOwnership() {
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
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

/** A success tap. Never allowed to fail the mutation it follows. */
function succeeded() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

function reportFailure(title: string, error: unknown) {
  Alert.alert(title, error instanceof ApiError ? error.message : 'Something went wrong.');
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

export function useAddToCollection() {
  const { getClient } = useKeys();
  const invalidate = useInvalidateOwnership();
  return useMutation({
    mutationFn: (item: NewCollectionItem) => addToCollection(getClient(), item),
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
