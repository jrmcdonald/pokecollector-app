import { FlashList } from '@shopify/flash-list';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import type { BinderCard, BinderCards } from '@/api/schemas';
import { CardTile } from '@/components/card-tile';
import { ProgressBar } from '@/components/progress-bar';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useBinderCards, useIsOnline, useRemoveFromBinder } from '@/hooks/queries';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { spacing, useColors } from '@/theme';
import { isPlanned } from '@/utils/binders';
import { formatPrice, formatTotal } from '@/utils/pricing';
import { completion } from '@/utils/sets';
import { showToast } from '@/utils/toast';

/**
 * One binder's cards. Planned binders mark what is still missing; collection
 * binders only ever hold owned copies. A card's long-press menu takes it out
 * of the binder (it stays in the collection).
 */
export default function BinderDetail() {
  const { id = '', name } = useLocalSearchParams<{ id: string; name?: string }>();
  const binderId = Number(id);
  const colors = useColors();
  const online = useIsOnline();
  const binder = useBinderCards(binderId);
  const pull = usePullToRefresh(() => binder.refetch());
  const remove = useRemoveFromBinder();
  const data = binder.data;
  const planned = data ? isPlanned(data.binder) : false;

  // Chosen from the long-press menu, which is already the deliberate second
  // step, so no confirmation: the copy stays in the collection either way.
  function removeCard(card: BinderCard) {
    if (!online) {
      showToast({ kind: 'info', title: 'Offline', message: 'Changes need a connection.' });
      return;
    }
    remove.mutate(
      { binderId, binderCardId: card.binder_card_id },
      {
        onSuccess: () =>
          showToast({
            kind: 'success',
            title: `${card.name} taken out of the binder`,
            message: 'It is still in your collection.',
          }),
      },
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: data?.binder.name ?? name ?? '' }} />
      {data ? (
        <FlashList
          data={data.cards}
          numColumns={3}
          keyExtractor={(card) => String(card.binder_card_id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          ListHeaderComponent={<Summary data={data} planned={planned} />}
          renderItem={({ item: card }) => (
            <CardTile
              card={card}
              detail={[card.variant, formatPrice(card.price_market)].filter(Boolean).join(' · ')}
              quantity={
                card.required_quantity && card.required_quantity > 1 ? card.required_quantity : 0
              }
              missing={planned && !card.owned}
              variant={card.variant}
              photoItemId={card.has_scan_photo ? card.collection_item_id : null}
              menu={
                <Link.MenuAction icon="minus.circle" destructive onPress={() => removeCard(card)}>
                  Take out of binder
                </Link.MenuAction>
              }
              accessibilityActions={[
                {
                  name: 'remove',
                  label: 'Take out of binder',
                  onAction: () => removeCard(card),
                },
              ]}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="This binder is empty"
              message="Add cards from a card's page, with “Add to binder”."
            />
          }
        />
      ) : binder.error ? (
        <ErrorState error={binder.error} onRetry={() => binder.refetch()} />
      ) : (
        <GridSkeleton />
      )}
    </ThemedView>
  );
}

function Summary({ data, planned }: { data: BinderCards; planned: boolean }) {
  const owned = data.owned_count ?? 0;
  const total = data.total_count ?? data.cards.length;
  return (
    <View style={styles.header}>
      {planned ? (
        <>
          <View style={styles.row}>
            <ThemedText variant="figure">
              {owned}
              <ThemedText variant="figureSmall" color="textSecondary">
                {' '}
                / {total}
              </ThemedText>
            </ThemedText>
            <ThemedText variant="caption" color="textSecondary">
              {formatTotal(data.cost_to_complete ?? 0)} to complete
            </ThemedText>
          </View>
          <ProgressBar value={completion(owned, total)} height={8} />
        </>
      ) : (
        <View style={styles.row}>
          <ThemedText variant="figure">{total === 1 ? '1 card' : `${total} cards`}</ThemedText>
          <ThemedText variant="figureSmall" color="textSecondary">
            {formatTotal(data.current_value ?? 0)}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: spacing.sm },
  header: { padding: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
