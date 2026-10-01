import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useSession } from '@/session/session';
import { radius, useColors } from '@/theme';
import {
  cardImageSource,
  collectionPhotoSource,
  type CardImageFields,
  type ImageSize,
} from '@/utils/images';

import { Icon } from './icon';

/** A card's printed proportions, 63 × 88 mm. */
export const CARD_ASPECT = 63 / 88;

/**
 * How the card's edge is drawn, and what it says:
 * - `plain`: a quiet hairline, for most cards.
 * - `holo`: the teal edge, for a copy that is holo or reverse holo.
 * - `missing`: a dashed outline and a faded image, for a card not owned in a
 *   checklist or planned binder, so it is told apart by more than contrast.
 */
export type CardFrame = 'plain' | 'holo' | 'missing';

type Props = {
  card: CardImageFields;
  size: ImageSize;
  style?: StyleProp<ViewStyle>;
  frame?: CardFrame;
  /**
   * A collection entry with the owner's own photo, shown only when the card
   * has no other image.
   */
  photoItemId?: number | null;
};

export function CardImage({ card, size, style, frame = 'plain', photoItemId }: Props) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const { session } = useSession();
  const proxy =
    session.status === 'signedIn'
      ? { baseUrl: session.client.activeBaseUrl, headers: session.client.proxyHeaders }
      : { baseUrl: '', headers: {} };
  const source =
    cardImageSource(card, size, proxy) ??
    (session.status === 'signedIn'
      ? collectionPhotoSource(photoItemId, {
          ...proxy,
          token: session.client.sessionToken,
          scope: session.cacheId,
        })
      : null);

  const edge =
    frame === 'holo'
      ? { borderWidth: 1.5, borderColor: colors.holo }
      : frame === 'missing'
        ? { borderWidth: 1.5, borderColor: colors.outline, borderStyle: 'dashed' as const }
        : { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border };

  return (
    <View
      style={[styles.frame, { backgroundColor: colors.surface }, edge, style]}
      accessibilityIgnoresInvertColors>
      {source ? (
        <Image
          source={source}
          style={[StyleSheet.absoluteFill, frame === 'missing' && styles.faded]}
          // Cover, not contain: scans are a hair taller than a 63 × 88 card,
          // and contain left a sliver of background at the top and bottom.
          contentFit="cover"
          accessibilityIgnoresInvertColors
          transition={reduceMotion ? 0 : 120}
          recyclingKey={card.id}
          cachePolicy="disk"
        />
      ) : (
        // TCGdex has no picture for some cards, the Scarlet & Violet basic
        // Energy among them. A mark says so, rather than an empty box that
        // looks like it is still loading.
        <View style={styles.missing}>
          <Icon
            name={card.supertype === 'Energy' ? 'bolt.fill' : 'photo'}
            size={size === 'large' ? 40 : 16}
            color="textSecondary"
          />
        </View>
      )}
    </View>
  );
}

/** Holo and reverse holo copies get the teal edge; everything else is plain. */
export function frameForVariant(variant: string | null | undefined): CardFrame {
  return variant === 'Holo' || variant === 'Reverse Holo' ? 'holo' : 'plain';
}

const styles = StyleSheet.create({
  frame: { aspectRatio: CARD_ASPECT, borderRadius: radius.sm, overflow: 'hidden' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  faded: { opacity: 0.35 },
});
