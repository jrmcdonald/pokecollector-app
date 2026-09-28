import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { CardTile } from '@/components/card-tile';
import { ProgressBar } from '@/components/progress-bar';
import { Segmented } from '@/components/segmented';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSetChecklist } from '@/hooks/queries';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { spacing, useColors } from '@/theme';
import { formatPrice } from '@/utils/pricing';
import { completion, isOwned } from '@/utils/sets';

type Show = 'all' | 'missing' | 'owned';

/** A set's checklist: every card in number order, missing ones marked. */
export default function SetChecklist() {
  const { id = '', name } = useLocalSearchParams<{ id: string; name?: string }>();
  const colors = useColors();
  const checklist = useSetChecklist(id);
  const pull = usePullToRefresh(() => checklist.refetch());
  const [show, setShow] = useState<Show>('all');
  const data = checklist.data;
  const shown = useMemo(
    () =>
      (data?.cards ?? []).filter((card) =>
        show === 'all' ? true : show === 'owned' ? isOwned(card) : !isOwned(card),
      ),
    [data, show],
  );

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: data?.set.name ?? name ?? '' }} />
      {data ? (
        <FlashList
          data={shown}
          numColumns={3}
          keyExtractor={(card) => card.id}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <View
                style={styles.progress}
                accessible
                accessibilityLabel={`${data.owned_count} of ${data.total_count} owned, ${Math.round(completion(data.owned_count, data.total_count) * 100)} percent`}>
                <ThemedText variant="figure">
                  {data.owned_count}
                  <ThemedText variant="figureSmall" color="textSecondary">
                    {' '}
                    / {data.total_count}
                  </ThemedText>
                </ThemedText>
                <ThemedText variant="figureSmall" color="textSecondary">
                  {Math.round(completion(data.owned_count, data.total_count) * 100)}%
                </ThemedText>
              </View>
              <ProgressBar
                value={completion(data.owned_count, data.total_count)}
                height={8}
                decorative
              />
              <Segmented<Show>
                label="Show"
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'missing', label: 'Missing' },
                  { value: 'owned', label: 'Owned' },
                ]}
                value={show}
                onChange={setShow}
              />
            </View>
          }
          renderItem={({ item: card }) => (
            <CardTile
              card={card}
              detail={[card.number, formatPrice(card.price_trend ?? card.price_market)]
                .filter(Boolean)
                .join(' · ')}
              quantity={card.owned_quantity ?? 0}
              missing={!isOwned(card)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={show === 'missing' ? 'Set complete' : 'Nothing owned yet'}
              message={
                show === 'missing'
                  ? 'You own every card in this set.'
                  : 'Cards you own from this set show up here.'
              }
            />
          }
        />
      ) : checklist.error ? (
        <ErrorState error={checklist.error} onRetry={() => checklist.refetch()} />
      ) : (
        <GridSkeleton />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: spacing.sm },
  header: { padding: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm + 4 },
  progress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
