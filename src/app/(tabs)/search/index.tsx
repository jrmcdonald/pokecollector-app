import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CardTile } from '@/components/card-tile';
import { FilterButton } from '@/components/filter-button';
import { SearchField } from '@/components/search-field';
import { SetPicker } from '@/components/set-picker';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCachedCollection, useCardSearch } from '@/hooks/queries';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCardColumns } from '@/hooks/use-large-text';
import { spacing, useColors } from '@/theme';
import { pick } from '@/utils/pick';
import {
  CATEGORIES,
  NO_SEARCH_FILTER,
  TYPES,
  exactRarity,
  hasFilter,
  rarityIsAmbiguous,
  rarityLabel,
  rarityOptions,
  typeApplies,
  type SearchFilter,
} from '@/utils/search-filters';

/**
 * Long enough that typing a name is one request, not one per letter: the
 * backend allows 60 a minute, shared with everything else behind the tunnel.
 * Filters are a deliberate tap, so they search at once.
 */
const DEBOUNCE_MS = 400;

/**
 * With a rarity, pages can come back mostly near misses. Fetch on by itself
 * until this many cards show, but no further than this many pages before
 * the person asks for more.
 */
const FILL_TO = 24;
const MAX_AUTO_PAGES = 3;

export default function Search() {
  const columns = useCardColumns();
  const colors = useColors();
  // Scan's "search instead" opens this tab with what the scanner read.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(q ?? '');
  const [filter, setFilter] = useState<SearchFilter>(NO_SEARCH_FILTER);
  const [pickingSet, setPickingSet] = useState(false);
  // A new q (the tab stays mounted) replaces what was typed, and drops the
  // filters, which could hide the scanned card. Adjusted during render
  // rather than in an effect, so there is no render with the old text.
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    if (q) {
      setText(q);
      setFilter(NO_SEARCH_FILTER);
    }
  }
  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const search = useCardSearch(query, filter);
  const owned = useCachedCollection();
  const rarities = useMemo(
    () => rarityOptions((owned ?? []).map((item) => item.card?.rarity)),
    [owned],
  );

  const filtered = hasFilter(filter);
  const searching = query.length >= 2 || filtered;
  const pages = search.data?.pages ?? [];
  const results = searching
    ? exactRarity(
        pages.flatMap((page) => page.data),
        filter.rarity,
      )
    : [];
  // Upstream's total counts the near misses the phone leaves out, so with a
  // rarity that has them the count is what has loaded, and "+" if there is more.
  const nearMisses = !!filter.rarity && rarityIsAmbiguous(filter.rarity, rarities);
  const total = nearMisses ? results.length : (pages[0]?.total_count ?? 0);
  const more = nearMisses && !!search.hasNextPage;

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = search;
  // Never after a failed page: retrying on its own would hammer a server that
  // may be refusing for the rate limit. Scrolling or "Look further" asks again.
  const filling =
    searching &&
    !!filter.rarity &&
    !!hasNextPage &&
    !isFetchNextPageError &&
    results.length < FILL_TO &&
    pages.length < MAX_AUTO_PAGES;
  useEffect(() => {
    if (filling && !isFetchingNextPage) fetchNextPage();
  }, [filling, isFetchingNextPage, fetchNextPage]);
  const lookFurther = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  async function chooseRarity() {
    const index = await pick('Rarity', ['All', ...rarities.map(rarityLabel)]);
    if (index === null) return;
    setFilter((f) => ({ ...f, rarity: index === 0 ? null : (rarities[index - 1] ?? null) }));
  }

  async function chooseCategory() {
    const index = await pick('Category', ['All', ...CATEGORIES.map((c) => c.label)]);
    if (index === null) return;
    const category = index === 0 ? null : (CATEGORIES[index - 1]?.value ?? null);
    // A type means nothing for a Trainer or an Energy, so it goes with them.
    setFilter((f) => ({
      ...f,
      category,
      type: category && category !== 'Pokemon' ? null : f.type,
    }));
  }

  async function chooseType() {
    const index = await pick('Type', ['All', ...TYPES]);
    if (index === null) return;
    setFilter((f) => ({ ...f, type: index === 0 ? null : (TYPES[index - 1] ?? null) }));
  }

  const categoryLabel = CATEGORIES.find((c) => c.value === filter.category)?.label;

  // One list for every state, with the field as its header: swapping
  // components when results arrive would remount the field and drop the
  // keyboard mid-word. The field scrolls under the large title, which
  // collapses as results scroll.
  return (
    <ThemedView style={styles.fill}>
      <FlashList
        data={results}
        // A new list when the text size changes the columns: FlashList
        // cannot change them in place.
        key={columns}
        numColumns={columns}
        keyExtractor={(card) => card.id}
        contentContainerStyle={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchField
              value={text}
              onChangeText={setText}
              placeholder="Card name, or a code like PFL 001"
              accessibilityLabel="Search the catalogue"
              autoFocus={false}
            />
            <View style={styles.buttons}>
              <FilterButton
                name="Set"
                label={filter.set?.name ?? 'Set'}
                active={!!filter.set}
                onPress={() => setPickingSet(true)}
              />
              <FilterButton
                name="Rarity"
                label={filter.rarity ? rarityLabel(filter.rarity) : 'Rarity'}
                active={!!filter.rarity}
                onPress={chooseRarity}
              />
              <FilterButton
                name="Category"
                label={categoryLabel ?? 'Category'}
                active={!!filter.category}
                onPress={chooseCategory}
              />
              {typeApplies(filter) ? (
                <FilterButton
                  name="Type"
                  label={filter.type ?? 'Type'}
                  active={!!filter.type}
                  onPress={chooseType}
                />
              ) : null}
            </View>
            {searching && search.data ? (
              <ThemedText variant="figureSmall" color="textSecondary">
                {total === 1 && !more
                  ? '1 card'
                  : `${total.toLocaleString('en-GB')}${more ? '+' : ''} cards`}
              </ThemedText>
            ) : null}
          </View>
        }
        onEndReachedThreshold={0.5}
        onEndReached={lookFurther}
        renderItem={({ item }) => (
          <CardTile
            layout={columns === 1 ? 'row' : 'tile'}
            card={item}
            detail={[item.set_ref?.abbreviation ?? item.set_id?.toUpperCase(), item.number]
              .filter(Boolean)
              .join(' ')}
            quantity={item.owned_quantity ?? 0}
          />
        )}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={styles.footer} color={colors.textSecondary} />
          ) : more && results.length > 0 ? (
            // A short page of exact matches may not reach the end of the
            // screen, so scrolling cannot be what asks for the next.
            <View style={styles.footer}>
              <Button title="Look further" variant="secondary" onPress={lookFurther} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !searching ? (
            <EmptyState
              title="Search the catalogue"
              message="Every card PokeCollector knows about, with the ones you own marked. Type a name, or choose a filter."
            />
          ) : search.error ? (
            <ErrorState error={search.error} onRetry={() => search.refetch()} />
          ) : !search.data || filling ? (
            <GridSkeleton />
          ) : hasNextPage ? (
            <EmptyState
              title="None yet"
              message="The first cards found were other rarities."
              action={{ title: 'Look further', onPress: lookFurther }}
            />
          ) : (
            <EmptyState
              title="No cards found"
              message={
                query.length >= 2
                  ? `Nothing matches “${query}”${filtered ? ' with these filters' : ''}.`
                  : 'Nothing matches these filters.'
              }
              action={
                filtered
                  ? { title: 'Clear filters', onPress: () => setFilter(NO_SEARCH_FILTER) }
                  : undefined
              }
            />
          )
        }
      />
      <SetPicker
        visible={pickingSet}
        selectedId={filter.set?.id ?? null}
        onClose={() => setPickingSet(false)}
        onSelect={(set) => {
          setFilter((f) => ({ ...f, set: set ? { id: set.id, name: set.name } : null }));
          setPickingSet(false);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  footer: { padding: spacing.lg },
});
