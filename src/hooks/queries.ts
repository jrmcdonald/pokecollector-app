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
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import {
  addToCollection,
  addToWishlist,
  getCard,
  getCollection,
  getDashboard,
  removeFromCollection,
  searchCards,
  updateCollectionItem,
  type NewCollectionItem,
} from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import type { CollectionItem } from '@/api/schemas';
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

/** Refetches what a change to the collection affects. */
function useInvalidateOwnership() {
  const queryClient = useQueryClient();
  const { keys } = useKeys();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.collection }),
      queryClient.invalidateQueries({ queryKey: keys.dashboard }),
      queryClient.invalidateQueries({ queryKey: keys.searchAll }),
    ]);
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
    onError: (error) => reportFailure('Could not add to the wishlist', error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.searchAll }),
  });
}

/** Whether the phone has a connection, as TanStack Query sees it (NetInfo-backed). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  );
}
