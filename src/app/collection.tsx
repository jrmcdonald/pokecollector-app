import { FlashList } from '@shopify/flash-list';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import type { CollectionItem } from '@/api/schemas';
import { CardImage, frameForVariant } from '@/components/card-image';
import { CardTile } from '@/components/card-tile';
import { FilterButton } from '@/components/filter-button';
import { SearchField } from '@/components/search-field';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCollection } from '@/hooks/queries';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useCardColumns } from '@/hooks/use-large-text';
import { spacing, useColors } from '@/theme';
import {
  NO_FILTER,
  SORT_LABELS,
  filterCollection,
  filterOptions,
  setNameOf,
  sortCollection,
  type CollectionFilter,
  type CollectionSort,
  type FilterOption,
} from '@/utils/collection';
import { pick } from '@/utils/pick';
import { cardValue, formatPrice } from '@/utils/pricing';

const SORTS = Object.keys(SORT_LABELS) as CollectionSort[];

export default function Collection() {
  const columns = useCardColumns();
  const colors = useColors();
  const collection = useCollection();
  const pull = usePullToRefresh(() => collection.refetch());
  const [filter, setFilter] = useState<CollectionFilter>(NO_FILTER);
  const [sort, setSort] = useState<CollectionSort>('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');

  const items = collection.data;
  const options = useMemo(() => filterOptions(items ?? []), [items]);
  const shown = useMemo(
    () => sortCollection(filterCollection(items ?? [], filter), sort),
    [items, filter, sort],
  );

  async function choose(title: string, list: FilterOption[], key: 'setId' | 'rarity' | 'variant') {
    const index = await pick(title, ['All', ...list.map((o) => `${o.label} (${o.count})`)]);
    if (index === null) return;
    setFilter((f) => ({ ...f, [key]: index === 0 ? null : (list[index - 1]?.value ?? null) }));
  }

  const labelFor = (list: FilterOption[], value: string | null, fallback: string) =>
    value ? (list.find((o) => o.value === value)?.label ?? value) : fallback;

  const filtered = filter.setId || filter.rarity || filter.variant || filter.query;

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          title: 'Collection',
          // A native bar button rather than a custom view: iOS lays it out
          // (and gives it the system background) the way it expects.
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: layout === 'grid' ? 'List' : 'Grid',
              accessibilityLabel: layout === 'grid' ? 'Show as list' : 'Show as grid',
              icon: {
                type: 'sfSymbol',
                name: layout === 'grid' ? 'list.bullet' : 'square.grid.3x3',
              },
              onPress: () => setLayout((l) => (l === 'grid' ? 'list' : 'grid')),
            },
          ],
        }}
      />
      <View style={styles.controls}>
        <SearchField
          value={filter.query}
          onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
          placeholder="Name, set, number or artist"
        />
        <View style={styles.buttons}>
          <FilterButton
            name="Set"
            label={labelFor(options.sets, filter.setId, 'Set')}
            active={!!filter.setId}
            onPress={() => choose('Set', options.sets, 'setId')}
          />
          <FilterButton
            name="Rarity"
            label={labelFor(options.rarities, filter.rarity, 'Rarity')}
            active={!!filter.rarity}
            onPress={() => choose('Rarity', options.rarities, 'rarity')}
          />
          <FilterButton
            name="Variant"
            label={labelFor(options.variants, filter.variant, 'Variant')}
            active={!!filter.variant}
            onPress={() => choose('Variant', options.variants, 'variant')}
          />
          <FilterButton
            name="Sort"
            icon="arrow.up.arrow.down"
            label={SORT_LABELS[sort]}
            active={false}
            onPress={async () => {
              const index = await pick(
                'Sort by',
                SORTS.map((s) => SORT_LABELS[s]),
              );
              const next = index === null ? undefined : SORTS[index];
              if (next) setSort(next);
            }}
          />
        </View>
        {items ? (
          <ThemedText variant="figureSmall" color="textSecondary">
            {filtered ? `${shown.length} of ${items.length} entries` : `${items.length} entries`}
          </ThemedText>
        ) : null}
      </View>

      {items ? (
        <FlashList
          key={`${layout}-${columns}`}
          data={shown}
          numColumns={layout === 'grid' ? columns : 1}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          renderItem={({ item }) =>
            layout === 'grid' ? (
              <CardTile
                layout={columns === 1 ? 'row' : 'tile'}
                card={item.card ?? { id: item.card_id, name: item.card_id }}
                detail={formatPrice(cardValue(item.card, item.variant))}
                quantity={item.quantity}
                variant={item.variant}
                photoItemId={item.has_scan_photo ? item.id : null}
              />
            ) : (
              <CollectionRow item={item} />
            )
          }
          ListEmptyComponent={
            filtered ? (
              <EmptyState
                title="No matches"
                message="Nothing in your collection matches these filters."
                action={{ title: 'Clear filters', onPress: () => setFilter(NO_FILTER) }}
              />
            ) : (
              <EmptyState
                title="Your collection is empty"
                message="Find a card in Search and add it from its page."
                action={{ title: 'Search the catalogue', onPress: () => router.push('/search') }}
              />
            )
          }
        />
      ) : collection.error ? (
        <ErrorState error={collection.error} onRetry={() => collection.refetch()} />
      ) : (
        <GridSkeleton />
      )}
    </ThemedView>
  );
}

function CollectionRow({ item }: { item: CollectionItem }) {
  const card = item.card ?? { id: item.card_id, name: item.card_id };
  const value = cardValue(item.card, item.variant);
  const where = [setNameOf(item), item.card?.number].filter(Boolean).join(' · ');
  const what = [item.variant ?? 'Normal', item.condition].join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.name}, ${where}, ${what}, ${item.quantity} owned, ${formatPrice(value * item.quantity)}`}
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: item.card_id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <CardImage
        card={card}
        size="small"
        style={styles.rowImage}
        frame={frameForVariant(item.variant)}
        photoItemId={item.has_scan_photo ? item.id : null}
      />
      <View style={styles.rowText}>
        <ThemedText variant="label" numberOfLines={2}>
          {card.name}
        </ThemedText>
        <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
          {where}
        </ThemedText>
        <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
          {what}
        </ThemedText>
      </View>
      <View style={styles.rowRight}>
        {item.quantity > 1 ? <ThemedText variant="figureSmall">×{item.quantity}</ThemedText> : null}
        <ThemedText variant="figureSmall" color="textSecondary">
          {formatPrice(value * item.quantity)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  controls: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: { padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm },
  rowImage: { width: 48 },
  rowText: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
});
