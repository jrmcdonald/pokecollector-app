import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { WishlistItem } from '@/api/schemas';
import { CardImage } from '@/components/card-image';
import { CardTile } from '@/components/card-tile';
import { openMarketplace } from '@/components/find-for-sale';
import { EmptyState, ErrorState, GridSkeleton, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useIsOnline, useRemoveFromWishlist, useWishlist } from '@/hooks/queries';
import { useCardColumns } from '@/hooks/use-large-text';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { minTapTarget, spacing, useColors } from '@/theme';
import { marketplaces } from '@/utils/marketplaces';
import { pick } from '@/utils/pick';
import { cardValue, formatPrice, formatTotal } from '@/utils/pricing';
import { wishlistCost } from '@/utils/wishlist';
import {
  loadWishlistLayout,
  saveWishlistLayout,
  type WishlistLayout,
} from '@/utils/wishlist-layout';

/** More → Wishlist: a list with prices, or a grid of the cards, and what buying them all costs. */
export default function Wishlist() {
  const colors = useColors();
  const columns = useCardColumns();
  const wishlist = useWishlist();
  const pull = usePullToRefresh(() => wishlist.refetch());
  const items = wishlist.data;
  const cost = useMemo(() => wishlistCost(items ?? []), [items]);
  const allUnpriced = cost.count > 0 && cost.unpriced === cost.count;
  const [layout, setLayout] = useState<WishlistLayout>('list');
  const grid = layout === 'grid';

  useEffect(() => {
    let active = true;
    loadWishlistLayout().then((saved) => {
      if (active && saved) setLayout(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleLayout = () => {
    const next = grid ? 'list' : 'grid';
    setLayout(next);
    saveWishlistLayout(next);
  };

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          // A native bar button, as on the collection.
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: grid ? 'List' : 'Grid',
              accessibilityLabel: grid ? 'Show as list' : 'Show as grid',
              icon: { type: 'sfSymbol', name: grid ? 'list.bullet' : 'square.grid.3x3' },
              onPress: toggleLayout,
            },
          ],
        }}
      />
      {items ? (
        <FlashList
          // No recycle pool: FlashList 2.0.2 keeps cells past the end of a list
          // that shrank, showing their old items (a set searched for "char"
          // still showed what "c" found). Unused cells now unmount instead.
          maxItemsInRecyclePool={0}
          key={`${layout}-${columns}`}
          data={items}
          numColumns={grid ? columns : 1}
          keyExtractor={(item) => String(item.id)}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={grid ? styles.grid : undefined}
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
                  {grid
                    ? 'Hold a card to find it on eBay, Cardmarket or TCGplayer, or to remove it.'
                    : 'Hold a card to find it on eBay, Cardmarket or TCGplayer.'}
                </ThemedText>
              </View>
            ) : null
          }
          renderItem={({ item }) =>
            grid ? (
              <WishlistTile item={item} layout={columns === 1 ? 'row' : 'tile'} />
            ) : (
              <WishlistRow item={item} />
            )
          }
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
      ) : grid ? (
        <GridSkeleton />
      ) : (
        <ListSkeleton />
      )}
    </ThemedView>
  );
}

/** What can be done with a wishlist card besides opening it: find it for sale, or remove it. */
function useWishlistActions(item: WishlistItem) {
  const online = useIsOnline();
  const remove = useRemoveFromWishlist();
  const card = item.card ?? { id: item.card_id, name: item.card_id };
  const shops = marketplaces(card);
  return {
    card,
    online,
    remove: () => remove.mutate(item),
    actions: [
      ...shops.map((shop, index) => ({
        name: `shop-${index}`,
        label: shop.label,
        onAction: () => openMarketplace(shop.url),
      })),
      ...(online
        ? [
            {
              name: 'delete',
              label: 'Remove from wishlist',
              destructive: true,
              onAction: () => remove.mutate(item),
            },
          ]
        : []),
    ],
  };
}

/**
 * A wishlist card in the grid: its picture, price and how many are wanted.
 * Holding it offers the same actions as a row, as does VoiceOver's Actions
 * rotor; a grid has no swipe.
 */
function WishlistTile({ item, layout }: { item: WishlistItem; layout: 'tile' | 'row' }) {
  const { card, actions } = useWishlistActions(item);
  const price = cardValue(item.card);
  return (
    <CardTile
      layout={layout}
      card={card}
      detail={[
        price > 0 ? formatPrice(price) : 'No price',
        item.quantity > 1 ? `${item.quantity} wanted` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      actions={actions}
    />
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
  const { card, online, remove, actions } = useWishlistActions(item);
  const set = item.card?.set_ref?.name;
  const price = cardValue(item.card);

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
      onSwipeableOpen={remove}>
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: { padding: spacing.sm },
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
