import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { WishlistItem } from '@/api/schemas';
import { CardImage } from '@/components/card-image';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useIsOnline, useRemoveFromWishlist, useWishlist } from '@/hooks/queries';
import { minTapTarget, spacing, useColors } from '@/theme';
import { cardValue, formatPrice, formatTotal } from '@/utils/pricing';

export default function Wishlist() {
  const colors = useColors();
  const wishlist = useWishlist();
  const items = wishlist.data;
  const total = useMemo(
    () => (items ?? []).reduce((sum, item) => sum + cardValue(item.card) * item.quantity, 0),
    [items],
  );

  return (
    <ThemedView style={styles.fill}>
      {items ? (
        <FlashList
          data={items}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={wishlist.isRefetching}
              onRefresh={() => wishlist.refetch()}
              tintColor={colors.textSecondary}
            />
          }
          ListHeaderComponent={
            items.length > 0 ? (
              <View style={styles.header}>
                <ThemedText variant="overline" color="textSecondary">
                  To buy everything
                </ThemedText>
                <ThemedText variant="figure" style={{ color: colors.accent }}>
                  {formatTotal(total)}
                </ThemedText>
                <ThemedText variant="caption" color="textSecondary">
                  Swipe a card left to remove it.
                </ThemedText>
              </View>
            ) : null
          }
          renderItem={({ item }) => <WishlistRow item={item} />}
          ListEmptyComponent={
            <EmptyState
              title="Your wishlist is empty"
              message="Add cards from their page with “Add to wishlist”."
              action={{ title: 'Search the catalogue', onPress: () => router.push('/search') }}
            />
          }
        />
      ) : wishlist.error ? (
        <ErrorState error={wishlist.error} onRetry={() => wishlist.refetch()} />
      ) : (
        <ListSkeleton />
      )}
    </ThemedView>
  );
}

function WishlistRow({ item }: { item: WishlistItem }) {
  const colors = useColors();
  const online = useIsOnline();
  const remove = useRemoveFromWishlist();
  const card = item.card ?? { id: item.card_id, name: item.card_id };
  const set = item.card?.set_ref?.name;
  return (
    <Swipeable
      friction={2}
      rightThreshold={48}
      enabled={online}
      // Swiping past the threshold removes it; VoiceOver users get the same
      // through the row's "Remove" action.
      renderRightActions={() => (
        <View style={[styles.action, { backgroundColor: colors.danger }]}>
          <ThemedText variant="label" style={{ color: colors.onAccent }}>
            Remove
          </ThemedText>
        </View>
      )}
      onSwipeableOpen={() => remove.mutate(item)}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Swipe left to remove"
        accessibilityActions={online ? [{ name: 'delete', label: 'Remove' }] : []}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') remove.mutate(item);
        }}
        onPress={() => router.push({ pathname: '/card/[id]', params: { id: item.card_id } })}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? colors.surface : colors.background },
          { borderBottomColor: colors.border },
        ]}>
        <CardImage card={card} size="small" style={styles.image} />
        <View style={styles.text}>
          <ThemedText variant="label" numberOfLines={1}>
            {card.name}
          </ThemedText>
          <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
            {[set, item.card?.number, item.card?.rarity].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        <View style={styles.right}>
          <ThemedText variant="figureSmall">{formatPrice(cardValue(item.card))}</ThemedText>
          {item.quantity > 1 ? (
            <ThemedText variant="figureSmall" color="textSecondary">
              ×{item.quantity}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { padding: spacing.md, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  image: { width: 52 },
  text: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
  action: {
    width: 96,
    minHeight: minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
