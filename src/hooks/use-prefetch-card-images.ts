import { Image } from 'expo-image';
import { useEffect } from 'react';

import type { DeckEntry } from '@/api/schemas';

/**
 * Starts fetching every thumbnail of a list at once, into the disk cache the
 * rows read from. A row otherwise asks TCGdex for its picture only when it
 * scrolls into view, so a deck of cards new to the phone fills in one by
 * one. The pictures come from TCGdex's CDN, not the server, so this costs
 * nothing against the rate limit.
 */
export function usePrefetchCardImages(entries: readonly DeckEntry[] | null | undefined) {
  const urls = (entries ?? []).flatMap((entry) => {
    const url = entry.card?.images_small ?? entry.card?.images_large;
    return url ? [url] : [];
  });
  const key = urls.join('\n');
  useEffect(() => {
    if (!key) return;
    try {
      Image.prefetch(key.split('\n'), 'disk').catch(() => undefined);
    } catch {
      // A convenience: the rows load their own pictures regardless.
    }
  }, [key]);
}
