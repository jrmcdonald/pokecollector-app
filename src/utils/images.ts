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
