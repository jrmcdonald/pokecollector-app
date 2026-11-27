import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

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
import { formatQuote, priceQuote, spokenQuote } from '@/utils/pricing';
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
        <>
          {/* The search stays above the list, not in its header: the list
              starts again with each letter, and a field inside it would lose
              the keyboard. Rarity and Show scroll with the list, so at the
              largest text size the cards keep most of the screen. */}
          <View style={styles.controls}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Name or number"
              accessibilityLabel="Search this set"
            />
          </View>
          <FlatList
            data={shown}
            // A new list for each search, and when the text size changes the
            // columns (FlatList cannot change them in place). On
            // the simulator, a list that narrowed in place has kept rows it
            // had dropped: a set searched for "char" still held Caterpie,
            // which "c" found, though the list was given only the Char cards.
            // That was so with FlashList and then FlatList, and not in Jest,
            // so it is in the native views; a list removed whole takes every
            // row with it. A set is a few hundred cards at most. Not for Show
            // or Rarity: they are in the header, which would start again too
            // and take VoiceOver's focus off the control just chosen.
            key={`${columns}|${query.trim()}`}
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
              // A fixed share of the row, so a short last row keeps the grid's
              // column widths instead of stretching.
              <View style={{ width: `${100 / columns}%` }}>
                <CardTile
                  layout={columns === 1 ? 'row' : 'tile'}
                  card={card}
                  detail={[card.number, formatQuote(priceQuote(card))].filter(Boolean).join(' · ')}
                  detailLabel={[card.number, spokenQuote(priceQuote(card))]
                    .filter(Boolean)
                    .join(', ')}
                  quantity={card.owned_quantity ?? 0}
                  missing={!isOwned(card)}
                />
              </View>
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
        </>
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
  controls: { padding: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm + 4 },
  header: { padding: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm + 4 },
  progress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
