import { useQueryClient } from '@tanstack/react-query';

import type { CardSet, SearchResponse, SetRef } from '@/api/schemas';
import { useCollection, useKeys } from '@/hooks/queries';
import { entriesForCard } from '@/utils/collection';

/**
 * A card's set: its name, code and printed size. The card endpoint has only
 * the set's id, so this looks where the app already has the rest, the
 * collection, an earlier search, then the sets list, and never fetches:
 * it is worth no request.
 */
export function useSetRef(cardId: string, setId?: string | null): SetRef | null {
  const queryClient = useQueryClient();
  const { enabled, keys } = useKeys();
  const collection = useCollection();
  const owned = entriesForCard(collection.data, cardId).find((e) => e.card?.set_ref)?.card?.set_ref;
  if (owned) return owned;
  if (!enabled) return null;
  for (const [, data] of queryClient.getQueriesData<{ pages: SearchResponse[] }>({
    queryKey: keys.searchAll,
  })) {
    for (const page of data?.pages ?? []) {
      const hit = page.data.find((result) => result.id === cardId);
      if (hit?.set_ref) return hit.set_ref;
    }
  }
  const set = setId
    ? queryClient.getQueryData<CardSet[]>(keys.sets)?.find((s) => s.id === setId)
    : undefined;
  return set
    ? {
        id: set.id,
        name: set.name,
        abbreviation: set.abbreviation,
        lang: set.lang,
        printed_total: set.printed_total,
      }
    : null;
}
