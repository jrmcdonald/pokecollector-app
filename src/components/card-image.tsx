import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useSession } from '@/session/session';
import { radius, useColors } from '@/theme';
import {
  cardImageSource,
  collectionPhotoSource,
  type CardImageFields,
  type ImageSize,
} from '@/utils/images';

/** A card's printed proportions, 63 × 88 mm. */
export const CARD_ASPECT = 63 / 88;

type Props = {
  card: CardImageFields;
  size: ImageSize;
  style?: StyleProp<ViewStyle>;
  /** Dims the image, for cards that are not owned in a checklist view. */
  dimmed?: boolean;
  /** The teal "holo" edge. Off for cards that are dimmed or very small. */
  edge?: boolean;
  /**
   * A collection entry with the owner's own photo, shown only when the card
   * has no other image.
   */
  photoItemId?: number | null;
};

export function CardImage({
  card,
  size,
  style,
  dimmed = false,
  edge = !dimmed,
  photoItemId,
}: Props) {
  const colors = useColors();
  const { session } = useSession();
  const proxy =
    session.status === 'signedIn'
      ? { baseUrl: session.client.activeBaseUrl, headers: session.client.accessHeaders }
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

  return (
    <View
      style={[
        styles.frame,
        { backgroundColor: colors.surface },
        edge && { borderWidth: 1.5, borderColor: colors.holo },
        style,
      ]}
      accessibilityIgnoresInvertColors>
      {source ? (
        <Image
          source={source}
          style={[StyleSheet.absoluteFill, dimmed && styles.dimmed]}
          // Cover, not contain: scans are a hair taller than a 63 × 88 card,
          // and contain left a sliver of background at the top and bottom.
          contentFit="cover"
          transition={120}
          recyclingKey={card.id}
          cachePolicy="disk"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: CARD_ASPECT, borderRadius: radius.sm, overflow: 'hidden' },
  dimmed: { opacity: 0.35 },
});
