/**
 * Features a server older than the pinned upstream may lack, found out from
 * the 404 its first use gets, never by asking first.
 *
 * The 404 is remembered for a day, per account, in the persisted query
 * cache. Meanwhile the feature's way in is hidden, so finding out costs one
 * request. After a day it shows again, in case the server has been updated.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import { NotFoundError } from '@/api/errors';

import { useKeys } from './queries';

const ONE_DAY = 24 * 60 * 60 * 1000;

/** Upstream 1.59.0's artist pages, and 1.57.0's bulk removal. */
export type ServerFeature = 'artists' | 'bulk-removal';

const missingKey = (cacheId: string | null, feature: ServerFeature) =>
  [cacheId, 'feature', `${feature}-missing`] as const;

/** A 404 is an answer, not a hiccup: asking again costs requests for nothing. */
export const retryUnlessMissing = (failureCount: number, error: unknown) =>
  !(error instanceof NotFoundError) && failureCount < 2;

/** Whether this server is not known to lack the feature. Costs nothing. */
export function useServerFeature(feature: ServerFeature, now: () => number = Date.now): boolean {
  const { cacheId } = useKeys();
  const missingSince = useQuery<number | null>({
    queryKey: missingKey(cacheId, feature),
    // Only ever set from a 404; nothing to fetch.
    queryFn: () => null,
    enabled: false,
    // Kept as long as the persisted cache keeps anything.
    gcTime: 7 * ONE_DAY,
  }).data;
  return missingSince == null || now() - missingSince > ONE_DAY;
}

/** Records a 404 from the feature's routes, which hides its way in for a day. */
export function useMarkFeatureMissing(feature: ServerFeature): (error: unknown) => boolean {
  const queryClient = useQueryClient();
  const { cacheId } = useKeys();
  return useCallback(
    (error: unknown) => {
      // A missing route is FastAPI's plain "Not Found". A 404 with an object
      // detail (`list_entries_unavailable`, say) is the feature answering.
      if (!(error instanceof NotFoundError) || error.detail !== undefined) return false;
      queryClient.setQueryData(missingKey(cacheId, feature), Date.now());
      return true;
    },
    [queryClient, cacheId, feature],
  );
}

/** As `useMarkFeatureMissing`, for a query's error. */
export function useMarkMissingOn(feature: ServerFeature, error: unknown) {
  const mark = useMarkFeatureMissing(feature);
  useEffect(() => {
    mark(error);
  }, [mark, error]);
}
