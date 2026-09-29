import { router } from 'expo-router';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { radius, spacing, useColors } from '@/theme';
import type { CardImageFields } from '@/utils/images';
import { pick } from '@/utils/pick';

import { CardImage, frameForVariant } from './card-image';
import { ThemedText } from './themed-text';

type Props = {
  card: CardImageFields & { name: string };
  /** The line under the name: a price, a set, a variant. */
  detail?: string;
  /** How many are owned. Shown as a badge from two up: one is the normal case. */
  quantity?: number;
  /** Not owned, in a checklist or planned binder: faded, with a dashed outline and a mark. */
  missing?: boolean;
  /** The owned copy's variant, which decides whether the holo edge is drawn. */
  variant?: string | null;
  /** A collection entry whose own photo stands in when the card has no image. */
  photoItemId?: number | null;
  /**
   * Extra actions: an action sheet on long press, and the same actions in
   * VoiceOver's Actions rotor, so no gesture is the only way (WCAG 2.5.1).
   */
  actions?: TileAction[];
};

export type TileAction = { name: string; label: string; destructive?: boolean; onAction(): void };

/** One card in a grid. Opens the card's detail screen. */
export function CardTile({
  card,
  detail,
  quantity = 0,
  missing = false,
  variant,
  photoItemId,
  actions = [],
}: Props) {
  const colors = useColors();
  const href = { pathname: '/card/[id]', params: { id: card.id } } as const;
  const label = `${card.name}${quantity > 0 ? `, ${quantity} owned` : missing ? ', missing' : ''}${detail ? `, ${detail}` : ''}`;

  async function showActions() {
    const index = await pick(
      card.name,
      actions.map((a) => a.label),
      { destructive: actions.flatMap((a, i) => (a.destructive ? [i] : [])) },
    );
    if (index !== null) actions[index]?.onAction();
  }

  // Not expo-router's Link.Menu: its native preview wrapper hid every tile
  // in a list from VoiceOver (the simulator audit found binders empty).
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={actions.map(({ name, label: l }) => ({ name, label: l }))}
      onAccessibilityAction={(event: AccessibilityActionEvent) =>
        actions.find((a) => a.name === event.nativeEvent.actionName)?.onAction()
      }
      onPress={() => router.push(href)}
      onLongPress={actions.length ? showActions : undefined}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View>
        <CardImage
          card={card}
          size="small"
          frame={missing ? 'missing' : frameForVariant(variant)}
          photoItemId={photoItemId}
        />
        {missing ? (
          <View style={[styles.mark, { backgroundColor: colors.background }]}>
            <ThemedText variant="caption" color="textSecondary" style={styles.markText}>
              Missing
            </ThemedText>
          </View>
        ) : null}
        {quantity > 1 ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: colors.background, borderColor: colors.outline },
            ]}>
            <ThemedText variant="figureSmall" style={styles.badgeText}>
              ×{quantity}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText variant="label" numberOfLines={2} style={styles.name}>
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
  mark: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs + 2,
  },
  markText: { fontSize: 11, lineHeight: 16 },
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
