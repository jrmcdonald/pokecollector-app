import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useColors } from '@/theme';
import type { CardImageFields } from '@/utils/images';

import { CardImage } from './card-image';
import { ThemedText } from './themed-text';

type Props = {
  card: CardImageFields & { name: string };
  /** The line under the name: a price, a set, a variant. */
  detail?: string;
  /** Shown as a badge when above zero. */
  quantity?: number;
  /** Greys the card out: not owned, in a checklist or planned binder. */
  dimmed?: boolean;
  onLongPress?(): void;
  /** A collection entry whose own photo stands in when the card has no image. */
  photoItemId?: number | null;
};

/** One card in a grid. Opens the card's detail screen. */
export function CardTile({
  card,
  detail,
  quantity = 0,
  dimmed = false,
  onLongPress,
  photoItemId,
}: Props) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.name}${quantity > 0 ? `, ${quantity} owned` : dimmed ? ', missing' : ''}`}
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View>
        <CardImage card={card} size="small" dimmed={dimmed} photoItemId={photoItemId} />
        {quantity > 0 ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: colors.background, borderColor: colors.holo },
            ]}>
            <ThemedText variant="figureSmall" style={styles.badgeText}>
              ×{quantity}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText variant="label" numberOfLines={1} style={styles.name}>
        {card.name}
      </ThemedText>
      {detail ? (
        <ThemedText variant="figureSmall" color="textSecondary" numberOfLines={1}>
          {detail}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, padding: spacing.xs },
  pressed: { opacity: 0.7 },
  name: { marginTop: spacing.sm },
  badge: {
    position: 'absolute',
    bottom: -spacing.sm,
    right: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.xs + 2,
  },
  badgeText: { fontSize: 11, lineHeight: 16 },
});
