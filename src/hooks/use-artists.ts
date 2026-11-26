/**
 * The artist directory and an artist's checklist (upstream 1.59.0,
 * Git-Romer/pokecollector#472), a page at a time.
 *
 * A server before 1.59.0 has neither route and answers 404. That is
 * remembered for a day, per account, in the persisted cache, and the entry
 * points (the illustrator on a card's page, Artists on Sets) are hidden
 * meanwhile: one request finds out, and no more are spent asking. After a
 * day the entry points come back, in case the server has been updated.
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import { getArtistChecklist, getArtists } from '@/api/endpoints';
import { NotFoundError } from '@/api/errors';

import { useKeys } from './queries';

const ONE_DAY = 24 * 60 * 60 * 1000;

/** A 404 is an answer, not a hiccup: asking again costs requests for nothing. */
const retryUnlessMissing = (failureCount: number, error: unknown) =>
  !(error instanceof NotFoundError) && failureCount < 2;

/** Whether this server is not known to lack the artist pages. Costs nothing. */
export function useArtistsAvailable(now: () => number = Date.now): boolean {
  const { keys } = useKeys();
  const missingSince = useQuery<number | null>({
    queryKey: keys.artistsMissing,
    // Only ever set from a 404; nothing to fetch.
    queryFn: () => null,
    enabled: false,
    // Kept as long as the persisted cache keeps anything.
    gcTime: 7 * ONE_DAY,
  }).data;
  return missingSince == null || now() - missingSince > ONE_DAY;
}

/** Records a 404 from the artist routes, which hides their entry points. */
function useRememberMissing(error: unknown) {
  const queryClient = useQueryClient();
  const { keys } = useKeys();
  useEffect(() => {
    if (error instanceof NotFoundError) queryClient.setQueryData(keys.artistsMissing, Date.now());
  }, [error, queryClient, keys.artistsMissing]);
}

/** Artists, most complete first. `q` should already be debounced. */
export function useArtists(q: string) {
  const { enabled, getClient, keys } = useKeys();
  const term = q.trim();
  const query = useInfiniteQuery({
    queryKey: keys.artists(term),
    queryFn: ({ pageParam }) => getArtists(getClient(), { q: term, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total_count ? last.page + 1 : undefined,
    enabled,
    // Ownership counts move with the collection, which invalidates these; the
    // catalogue itself changes with the nightly sync at most.
    staleTime: 30 * 60 * 1000,
    retry: retryUnlessMissing,
    // The list stays while the next search loads, not a skeleton per keystroke.
    placeholderData: keepPreviousData,
  });
  useRememberMissing(query.error);
  return query;
}

/** One artist's cards, all or missing only, in release and number order. */
export function useArtistChecklist(name: string, missingOnly: boolean) {
  const { enabled, getClient, keys } = useKeys();
  const query = useInfiniteQuery({
    queryKey: keys.artist(name, missingOnly),
    queryFn: ({ pageParam }) =>
      getArtistChecklist(getClient(), { artist: name, missingOnly, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.list_count ? last.page + 1 : undefined,
    enabled: enabled && name.trim().length > 0,
    staleTime: 30 * 60 * 1000,
    retry: retryUnlessMissing,
    // The header and its toggle stay while "Missing only" loads.
    placeholderData: keepPreviousData,
  });
  useRememberMissing(query.error);
  return query;
}
