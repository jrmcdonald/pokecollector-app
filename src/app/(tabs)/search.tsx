import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CardTile } from '@/components/card-tile';
import { SearchField } from '@/components/search-field';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCardSearch } from '@/hooks/queries';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { spacing, useColors } from '@/theme';

/**
 * Long enough that typing a name is one request, not one per letter: the
 * backend allows 60 a minute, shared with everything else behind the tunnel.
 */
const DEBOUNCE_MS = 400;

export default function Search() {
  const colors = useColors();
  // Scan's "search instead" opens this tab with what the scanner read.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(q ?? '');
  // A new q (the tab stays mounted) replaces what was typed. Adjusted during
  // render rather than in an effect, so there is no render with the old text.
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    if (q) setText(q);
  }
  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const search = useCardSearch(query);

  const results = search.data?.pages.flatMap((page) => page.data) ?? [];
  const total = search.data?.pages[0]?.total_count ?? 0;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['top']} style={styles.fill}>
        <View style={styles.header}>
          <ThemedText variant="title">Search</ThemedText>
          <SearchField
            value={text}
            onChangeText={setText}
            placeholder="Card name, or a code like PFL 001"
            autoFocus={false}
          />
          {query.length >= 2 && search.data ? (
            <ThemedText variant="caption" color="textSecondary">
              {total === 1 ? '1 card' : `${total.toLocaleString('en-GB')} cards`}
            </ThemedText>
          ) : null}
        </View>

        {query.length < 2 ? (
          <EmptyState
            title="Search the catalogue"
            message="Every card PokeCollector knows about, with the ones you own marked."
          />
        ) : search.error ? (
          <ErrorState error={search.error} onRetry={() => search.refetch()} />
        ) : !search.data ? (
          <GridSkeleton />
        ) : (
          <FlashList
            data={results}
            numColumns={3}
            keyExtractor={(card) => card.id}
            contentContainerStyle={styles.list}
            keyboardDismissMode="on-drag"
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (search.hasNextPage && !search.isFetchingNextPage) search.fetchNextPage();
            }}
            renderItem={({ item }) => (
              <CardTile
                card={item}
                detail={[item.set_ref?.abbreviation ?? item.set_id?.toUpperCase(), item.number]
                  .filter(Boolean)
                  .join(' ')}
                quantity={item.owned_quantity ?? 0}
              />
            )}
            ListFooterComponent={
              search.isFetchingNextPage ? (
                <ActivityIndicator style={styles.footer} color={colors.textSecondary} />
              ) : null
            }
            ListEmptyComponent={
              <EmptyState title="No cards found" message={`Nothing matches “${query}”.`} />
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.sm },
  footer: { padding: spacing.lg },
});
