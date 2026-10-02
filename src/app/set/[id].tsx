import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { CardTile } from '@/components/card-tile';
import { FilterButton } from '@/components/filter-button';
import { ProgressBar } from '@/components/progress-bar';
import { SearchField } from '@/components/search-field';
import { Segmented } from '@/components/segmented';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSetChecklist } from '@/hooks/queries';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useCardColumns } from '@/hooks/use-large-text';
import { spacing, useColors } from '@/theme';
import { pick } from '@/utils/pick';
import { formatPrice } from '@/utils/pricing';
import { rarityLabel } from '@/utils/search-filters';
import {
  checklistRarities,
  completion,
  filterChecklist,
  isOwned,
  type ChecklistShow,
} from '@/utils/sets';

/**
 * A set's checklist: every card in number order, missing ones marked. The
 * search and filters work over the one response, so they cost no requests.
 */
export default function SetChecklist() {
  const { id = '', name } = useLocalSearchParams<{ id: string; name?: string }>();
  const columns = useCardColumns();
  const colors = useColors();
  const checklist = useSetChecklist(id);
  const pull = usePullToRefresh(() => checklist.refetch());
  const [show, setShow] = useState<ChecklistShow>('all');
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<string | null>(null);
  const data = checklist.data;
  const shown = useMemo(
    () => filterChecklist(data?.cards ?? [], { show, query, rarity }),
    [data, show, query, rarity],
  );
  const rarities = useMemo(() => checklistRarities(data?.cards ?? []), [data]);
  const searching = !!query.trim() || !!rarity;

  async function chooseRarity() {
    const index = await pick('Rarity', [
      'All',
      ...rarities.map((r) => `${rarityLabel(r.value)} (${r.count})`),
    ]);
    if (index === null) return;
    setRarity(index === 0 ? null : (rarities[index - 1]?.value ?? null));
  }

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: data?.set.name ?? name ?? '' }} />
      {data ? (
        <FlashList
          data={shown}
          // A new list when the text size changes the columns: FlashList
          // cannot change them in place.
          key={columns}
          numColumns={columns}
          keyExtractor={(card) => card.id}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
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
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Name or number"
                accessibilityLabel="Search this set"
              />
              {rarities.length > 1 ? (
                <View style={styles.buttons}>
                  <FilterButton
                    name="Rarity"
                    label={rarity ? rarityLabel(rarity) : 'Rarity'}
                    active={!!rarity}
                    onPress={chooseRarity}
                  />
                </View>
              ) : null}
              <Segmented<ChecklistShow>
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
              layout={columns === 1 ? 'row' : 'tile'}
              card={card}
              detail={[card.number, formatPrice(card.price_trend ?? card.price_market)]
                .filter(Boolean)
                .join(' · ')}
              quantity={card.owned_quantity ?? 0}
              missing={!isOwned(card)}
            />
          )}
          ListEmptyComponent={
            searching ? (
              <EmptyState
                title="No matches"
                message={
                  show === 'all'
                    ? 'No card in this set matches.'
                    : `No ${show} card in this set matches.`
                }
                action={{
                  title: 'Clear filters',
                  onPress: () => {
                    setQuery('');
                    setRarity(null);
                    setShow('all');
                  },
                }}
              />
            ) : (
              <EmptyState
                title={show === 'missing' ? 'Set complete' : 'Nothing owned yet'}
                message={
                  show === 'missing'
                    ? 'You own every card in this set.'
                    : 'Cards you own from this set show up here.'
                }
              />
            )
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
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
