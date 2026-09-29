/**
 * Where a card's image comes from.
 *
 * The API already returns full TCGdex CDN URLs (`.../low.webp`, `.../high.webp`)
 * for every catalogue card. Those need no credentials and, more importantly,
 * do not count against the backend's 60 requests a minute. Only custom cards
 * without a TCGdex image go through PokeCollector's image proxy, which is
 * behind Access and so needs the service token headers.
 */
import type { ImageSource } from 'expo-image';

export interface CardImageFields {
  id: string;
  images_small?: string | null;
  images_large?: string | null;
  custom_image_url?: string | null;
}

export type ImageSize = 'small' | 'large';

export function cardImageSource(
  card: CardImageFields,
  size: ImageSize,
  proxy: { baseUrl: string; headers: Record<string, string> },
): ImageSource | null {
  const direct = size === 'small' ? card.images_small : card.images_large;
  const other = size === 'small' ? card.images_large : card.images_small;
  const cdn = direct ?? other;
  if (cdn) return { uri: cdn, cacheKey: cdn };

  if (card.custom_image_url) {
    const uri = `${proxy.baseUrl}/api/images/card/${encodeURIComponent(card.id)}/${size}`;
    return { uri, headers: proxy.headers, cacheKey: uri };
  }
  return null;
}

/**
 * A PokeCollector account's avatar: the Pokémon (1–151) chosen in the web UI,
 * as the official artwork the server keeps in its own cache. That route needs
 * no PokeCollector login, only Access. The cache key leaves out the address,
 * so the primary and fallback share one copy on disk, and it is fetched once
 * per Pokémon, not once per screen.
 *
 * The artwork is not bundled with the app: it is not ours to redistribute.
 */
export function avatarImageSource(
  avatarId: number | null | undefined,
  proxy: { baseUrl: string; headers: Record<string, string> },
): ImageSource | null {
  if (!avatarId || !Number.isInteger(avatarId) || avatarId < 1 || avatarId > 151) return null;
  if (!proxy.baseUrl) return null;
  return {
    uri: `${proxy.baseUrl}/api/pokedex/images/artwork/${avatarId}.png`,
    headers: proxy.headers,
    cacheKey: `pokedex-artwork-${avatarId}`,
  };
}

/**
 * The owner's own photo of a collection entry, for a card with no catalogue
 * or custom image: the same fallback PokeCollector's web UI uses. It needs
 * the PokeCollector login as well as Access, and costs a request, so it is
 * only ever the last resort, cached on disk per entry.
 */
export function collectionPhotoSource(
  itemId: number | null | undefined,
  proxy: { baseUrl: string; headers: Record<string, string>; token: string | null; scope: string },
): ImageSource | null {
  if (!itemId || !proxy.baseUrl || !proxy.token) return null;
  return {
    uri: `${proxy.baseUrl}/api/collection/${itemId}/photo`,
    headers: { ...proxy.headers, Authorization: `Bearer ${proxy.token}` },
    cacheKey: `collection-photo-${proxy.scope}-${itemId}`,
  };
}

/**
 * Upstream's copy of a scanned photo, for a batch photo the phone no longer
 * has (taken in the web UI, or the cache was cleared). It needs the login
 * and costs a request, so only a photo opened for review asks for it.
 */
export function scanPhotoSource(
  jobId: number,
  itemId: number,
  proxy: { baseUrl: string; headers: Record<string, string>; token: string | null; scope: string },
): ImageSource | null {
  if (!proxy.baseUrl || !proxy.token) return null;
  return {
    uri: `${proxy.baseUrl}/api/cards/recognize/jobs/${jobId}/items/${itemId}/image`,
    headers: { ...proxy.headers, Authorization: `Bearer ${proxy.token}` },
    cacheKey: `scan-photo-${proxy.scope}-${jobId}-${itemId}`,
  };
}
