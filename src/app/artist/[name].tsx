import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { NotFoundError } from '@/api/errors';
import { CardTile } from '@/components/card-tile';
import { ProgressBar } from '@/components/progress-bar';
import { Segmented } from '@/components/segmented';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useArtistChecklist } from '@/hooks/use-artists';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useCardColumns } from '@/hooks/use-large-text';
import { spacing, useColors } from '@/theme';
import { formatTotal } from '@/utils/pricing';
import { completion } from '@/utils/sets';

type Show = 'all' | 'missing';

/**
 * Every card one artist illustrated, a printing per card, owned or missing,
 * as a set's checklist shows a set (upstream 1.59.0's artist checklist).
 * Pages of 60 load as the grid scrolls; "Missing" is filtered upstream, so
 * it pages through missing cards only.
 */
export default function ArtistChecklist() {
  const { name = '' } = useLocalSearchParams<{ name: string }>();
  const columns = useCardColumns();
  const colors = useColors();
  const [show, setShow] = useState<Show>('all');
  const checklist = useArtistChecklist(name, show === 'missing');
  const pull = usePullToRefresh(() => checklist.refetch());
  const pages = checklist.data?.pages;
  const first = pages?.[0];
  const cards = useMemo(() => pages?.flatMap((page) => page.cards) ?? [], [pages]);

  const header = first ? (
    <View style={styles.header}>
      <View
        style={styles.progress}
        accessible
        accessibilityLabel={`${first.owned_count} of ${first.total_count} cards owned, ${Math.round(completion(first.owned_count, first.total_count) * 100)} percent`}>
        <ThemedText variant="figure">
          {first.owned_count}
          <ThemedText variant="figureSmall" color="textSecondary">
            {' '}
            / {first.total_count}
          </ThemedText>
        </ThemedText>
        <ThemedText variant="figureSmall" color="textSecondary">
          {Math.round(completion(first.owned_count, first.total_count) * 100)}%
        </ThemedText>
      </View>
      <ProgressBar value={completion(first.owned_count, first.total_count)} height={8} decorative />
      {first.missing_value ? (
        <ThemedText variant="caption" color="textSecondary">
          {formatTotal(first.missing_value)} for the missing cards, at today’s prices.
        </ThemedText>
      ) : null}
      <Segmented<Show>
        label="Show"
        options={[
          { value: 'all', label: 'All' },
          { value: 'missing', label: 'Missing only' },
        ]}
        value={show}
        onChange={setShow}
      />
    </View>
  ) : null;

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: name }} />
      {pages ? (
        <FlatList
          data={cards}
          // A new list when the text size changes the columns: FlatList
          // cannot change them in place.
          key={columns}
          numColumns={columns}
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
          ListHeaderComponent={header}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (checklist.hasNextPage && !checklist.isFetchingNextPage) {
              void checklist.fetchNextPage();
            }
          }}
          ListFooterComponent={
            checklist.isFetchingNextPage ? (
              <ActivityIndicator
                style={styles.more}
                color={colors.textSecondary}
                accessibilityLabel="Loading more cards"
              />
            ) : null
          }
          renderItem={({ item: card }) => (
            // A fixed share of the row, so a short last row keeps the grid's
            // column widths instead of stretching.
            <View style={{ width: `${100 / columns}%` }}>
              <CardTile
                layout={columns === 1 ? 'row' : 'tile'}
                card={card}
                detail={[card.set_name ?? card.set_ref?.name, card.number]
                  .filter(Boolean)
                  .join(' · ')}
                quantity={card.owned_quantity ?? 0}
                missing={!card.owned}
              />
            </View>
          )}
          ListEmptyComponent={
            show === 'missing' ? (
              <EmptyState
                title="All collected"
                message={`You own every card ${name} illustrated.`}
                action={{ title: 'Show all', onPress: () => setShow('all') }}
              />
            ) : (
              <EmptyState title="No cards" message={`No card in the catalogue names ${name}.`} />
            )
          }
        />
      ) : checklist.error instanceof NotFoundError ? (
        <EmptyState
          title="Not on this server yet"
          message="Artist pages need PokeCollector 1.59.0 or later on the server."
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
  more: { padding: spacing.lg },
});
