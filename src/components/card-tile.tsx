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
};

/** One card in a grid. Opens the card's detail screen. */
export function CardTile({ card, detail, quantity = 0 }: Props) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.name}${quantity > 0 ? `, ${quantity} owned` : ''}`}
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View>
        <CardImage card={card} size="small" />
        {quantity > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <ThemedText variant="caption" style={{ color: colors.onAccent, fontWeight: '700' }}>
              ×{quantity}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText variant="caption" numberOfLines={1} style={styles.name}>
        {card.name}
      </ThemedText>
      {detail ? (
        <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
          {detail}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, padding: spacing.xs },
  pressed: { opacity: 0.7 },
  name: { marginTop: spacing.xs, fontWeight: '600' },
  badge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
  },
});
