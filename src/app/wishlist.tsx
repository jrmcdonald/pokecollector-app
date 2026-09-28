import { FlashList } from '@shopify/flash-list';
import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { WishlistItem } from '@/api/schemas';
import { CardImage } from '@/components/card-image';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useIsOnline, useRemoveFromWishlist, useWishlist } from '@/hooks/queries';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { minTapTarget, spacing, useColors } from '@/theme';
import { cardValue, formatPrice, formatTotal } from '@/utils/pricing';
import { wishlistCost } from '@/utils/wishlist';

export default function Wishlist() {
  const colors = useColors();
  const wishlist = useWishlist();
  const pull = usePullToRefresh(() => wishlist.refetch());
  const items = wishlist.data;
  const cost = useMemo(() => wishlistCost(items ?? []), [items]);
  const allUnpriced = cost.count > 0 && cost.unpriced === cost.count;

  return (
    <ThemedView style={styles.fill}>
      {items ? (
        <FlashList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          ListHeaderComponent={
            items.length > 0 ? (
              <View
                style={styles.header}
                accessible
                accessibilityLabel={
                  allUnpriced
                    ? 'No prices yet'
                    : `To buy everything: ${formatTotal(cost.total)}${cost.unpriced ? `, plus ${cost.unpriced} without a price` : ''}`
                }>
                <ThemedText variant="overline" color="textSecondary">
                  To buy everything
                </ThemedText>
                <ThemedText variant="figure">
                  {allUnpriced ? '–' : formatTotal(cost.total)}
                </ThemedText>
                {cost.unpriced ? (
                  <ThemedText variant="caption" color="textSecondary">
                    {allUnpriced
                      ? 'None of these cards has a price yet.'
                      : `Plus ${cost.unpriced === 1 ? '1 card' : `${cost.unpriced} cards`} with no price yet.`}
                  </ThemedText>
                ) : null}
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

/**
 * A wishlist card. Tap opens it; the long-press menu or a swipe left removes
 * it, and VoiceOver has the same Remove action, so no gesture is the only
 * way (WCAG 2.5.1).
 */
function WishlistRow({ item }: { item: WishlistItem }) {
  const colors = useColors();
  const online = useIsOnline();
  const remove = useRemoveFromWishlist();
  const card = item.card ?? { id: item.card_id, name: item.card_id };
  const set = item.card?.set_ref?.name;
  const price = cardValue(item.card);
  return (
    <Swipeable
      friction={2}
      rightThreshold={48}
      enabled={online}
      renderRightActions={() => (
        <View style={[styles.action, { backgroundColor: colors.danger }]}>
          <ThemedText variant="label" style={{ color: colors.onAccent }}>
            Remove
          </ThemedText>
        </View>
      )}
      onSwipeableOpen={() => remove.mutate(item)}>
      <Link href={{ pathname: '/card/[id]', params: { id: item.card_id } }} asChild>
        <Link.Trigger>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${card.name}, ${price > 0 ? formatPrice(price) : 'no price yet'}${item.quantity > 1 ? `, ${item.quantity} wanted` : ''}`}
            accessibilityActions={online ? [{ name: 'delete', label: 'Remove' }] : []}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'delete') remove.mutate(item);
            }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? colors.surface : colors.background },
              { borderBottomColor: colors.border },
            ]}>
            <CardImage card={card} size="small" style={styles.image} />
            <View style={styles.text}>
              <ThemedText variant="label" numberOfLines={2}>
                {card.name}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                {[set, item.card?.number, item.card?.rarity].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
            <View style={styles.right}>
              <ThemedText variant="figureSmall" color={price > 0 ? 'text' : 'textSecondary'}>
                {price > 0 ? formatPrice(price) : 'No price'}
              </ThemedText>
              {item.quantity > 1 ? (
                <ThemedText variant="figureSmall" color="textSecondary">
                  ×{item.quantity}
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        </Link.Trigger>
        <Link.Menu>
          <Link.MenuAction
            icon="trash"
            destructive
            disabled={!online}
            onPress={() => remove.mutate(item)}>
            Remove from wishlist
          </Link.MenuAction>
        </Link.Menu>
      </Link>
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
