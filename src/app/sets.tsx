import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { Chips } from '@/components/chips';
import { ListRow } from '@/components/list-row';
import { ProgressBar } from '@/components/progress-bar';
import { SearchField } from '@/components/search-field';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSets } from '@/hooks/queries';
import { spacing, useColors } from '@/theme';
import { completion, filterSets } from '@/utils/sets';

type Show = 'started' | 'all';

export default function Sets() {
  const colors = useColors();
  const sets = useSets();
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('started');
  const shown = useMemo(
    () => filterSets(sets.data ?? [], { query, startedOnly: show === 'started' }),
    [sets.data, query, show],
  );

  return (
    <ThemedView style={styles.fill}>
      <View style={styles.controls}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Set name or series" />
        <Chips<Show>
          label="Show"
          options={[
            { value: 'started', label: 'Started' },
            { value: 'all', label: 'All sets' },
          ]}
          value={show}
          onChange={setShow}
        />
      </View>
      {sets.data ? (
        <FlashList
          data={shown}
          keyExtractor={(set) => set.id}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={sets.isRefetching}
              onRefresh={() => sets.refetch()}
              tintColor={colors.textSecondary}
            />
          }
          renderItem={({ item: set }) => {
            const owned = set.owned_count ?? 0;
            const total = set.total ?? 0;
            return (
              <ListRow
                title={set.name}
                subtitle={[set.series, set.release_date?.slice(0, 4)].filter(Boolean).join(' · ')}
                accessibilityLabel={`${set.name}, ${owned} of ${total} owned`}
                trailing={
                  <ThemedText variant="figureSmall" color="textSecondary">
                    {owned}/{total}
                  </ThemedText>
                }
                footer={<ProgressBar value={completion(owned, total)} />}
                onPress={() =>
                  router.push({ pathname: '/set/[id]', params: { id: set.id, name: set.name } })
                }
              />
            );
          }}
          ListEmptyComponent={
            show === 'started' && !query ? (
              <EmptyState
                title="No sets started"
                message="Sets you own a card from show up here."
                action={{ title: 'Show all sets', onPress: () => setShow('all') }}
              />
            ) : (
              <EmptyState title="No matches" message="No set matches that search." />
            )
          }
        />
      ) : sets.error ? (
        <ErrorState error={sets.error} onRetry={() => sets.refetch()} />
      ) : (
        <ListSkeleton />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  controls: { padding: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
});
