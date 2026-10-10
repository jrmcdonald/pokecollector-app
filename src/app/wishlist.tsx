import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { WishlistItem } from '@/api/schemas';
import { CardImage } from '@/components/card-image';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useIsOnline, useRemoveFromWishlist, useWishlist } from '@/hooks/queries';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { minTapTarget, spacing, useColors } from '@/theme';
import { marketplaces } from '@/utils/marketplaces';
import { pick } from '@/utils/pick';
import { cardValue, formatPrice, formatTotal } from '@/utils/pricing';
import { showToast } from '@/utils/toast';
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
          // No recycle pool: FlashList 2.0.2 keeps cells past the end of a list
          // that shrank, showing their old items (a set searched for "char"
          // still showed what "c" found). Unused cells now unmount instead.
          maxItemsInRecyclePool={0}
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
              <View style={styles.header}>
                <View
                  style={styles.total}
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
                <ThemedText variant="caption" color="textSecondary">
                  Hold a card to find it on eBay, Cardmarket or TCGplayer.
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

/**
 * A wishlist card. Tap opens it; holding it offers to find it for sale, and
 * Remove, as does a swipe left for Remove. VoiceOver has the same actions,
 * so no gesture is the only way (WCAG 2.5.1). The marketplaces are links,
 * so they work offline too; Remove needs the server.
 */
function WishlistRow({ item }: { item: WishlistItem }) {
  const colors = useColors();
  const online = useIsOnline();
  const remove = useRemoveFromWishlist();
  const card = item.card ?? { id: item.card_id, name: item.card_id };
  const set = item.card?.set_ref?.name;
  const price = cardValue(item.card);
  const shops = marketplaces(card);
  const actions = [
    ...shops.map((shop, index) => ({
      name: `shop-${index}`,
      label: shop.label,
      onAction: () => open(shop.url),
    })),
    ...(online
      ? [{ name: 'delete', label: 'Remove from wishlist', onAction: () => remove.mutate(item) }]
      : []),
  ];

  async function offerActions() {
    const index = await pick(
      card.name,
      actions.map((action) => action.label),
      { destructive: online ? [actions.length - 1] : [] },
    );
    if (index !== null) actions[index]?.onAction();
  }

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${card.name}, ${price > 0 ? formatPrice(price) : 'no price yet'}${item.quantity > 1 ? `, ${item.quantity} wanted` : ''}`}
        accessibilityActions={actions.map(({ name, label }) => ({
          name,
          label: name === 'delete' ? 'Remove' : label,
        }))}
        onAccessibilityAction={(event) =>
          actions.find((action) => action.name === event.nativeEvent.actionName)?.onAction()
        }
        onPress={() => router.push({ pathname: '/card/[id]', params: { id: item.card_id } })}
        onLongPress={offerActions}
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
    </Swipeable>
  );
}

/** Opens a marketplace in its app if installed (eBay's links are universal links), or Safari. */
function open(url: string) {
  Linking.openURL(url).catch(() =>
    showToast({ kind: 'error', title: 'Could not open the link', message: url }),
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { padding: spacing.md, gap: spacing.sm },
  total: { gap: 2 },
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
