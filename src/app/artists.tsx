import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { NotFoundError } from '@/api/errors';
import { CardImage } from '@/components/card-image';
import { ListRow } from '@/components/list-row';
import { ProgressBar } from '@/components/progress-bar';
import { SearchField } from '@/components/search-field';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useArtists } from '@/hooks/use-artists';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { radius, spacing, useColors } from '@/theme';
import { completion } from '@/utils/sets';

/** Long enough that typing a name sends one search, not one a letter. */
export const ARTIST_SEARCH_DEBOUNCE_MS = 400;

/**
 * Every illustrator in the catalogue, most complete first, with how many of
 * their cards are owned (upstream 1.59.0's artist directory). Searching is
 * upstream's, case- and accent-insensitive; pages of 50 load as it scrolls.
 */
export default function Artists() {
  const colors = useColors();
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), ARTIST_SEARCH_DEBOUNCE_MS);
  const artists = useArtists(q);
  const pull = usePullToRefresh(() => artists.refetch());
  const pages = artists.data?.pages;
  const rows = useMemo(() => pages?.flatMap((page) => page.artists) ?? [], [pages]);

  return (
    <ThemedView style={styles.fill}>
      <View style={styles.controls}>
        <SearchField
          value={text}
          onChangeText={setText}
          placeholder="Artist name"
          accessibilityLabel="Search artists"
        />
      </View>
      {pages ? (
        <FlashList
          // No recycle pool: FlashList 2.0.2 keeps cells past the end of a list
          // that shrank, showing their old items. Unused cells now unmount.
          maxItemsInRecyclePool={0}
          data={rows}
          keyExtractor={(artist) => artist.name}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (artists.hasNextPage && !artists.isFetchingNextPage) void artists.fetchNextPage();
          }}
          ListFooterComponent={
            artists.isFetchingNextPage ? (
              <ActivityIndicator
                style={styles.more}
                color={colors.textSecondary}
                accessibilityLabel="Loading more artists"
              />
            ) : null
          }
          renderItem={({ item: artist }) => {
            const preview = artist.preview_cards?.[0];
            return (
              <ListRow
                title={artist.name}
                leading={
                  preview ? (
                    // Decoration: the row's label already names the artist.
                    <CardImage card={preview} size="small" style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: colors.surfaceRaised }]} />
                  )
                }
                accessibilityLabel={`${artist.name}, ${artist.owned_count} of ${artist.total_count} cards owned`}
                trailing={
                  <ThemedText variant="figureSmall" color="textSecondary">
                    {artist.owned_count}/{artist.total_count}
                  </ThemedText>
                }
                footer={<ProgressBar value={completion(artist.owned_count, artist.total_count)} />}
                onPress={() =>
                  router.push({ pathname: '/artist/[name]', params: { name: artist.name } })
                }
              />
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No artists"
              message={q ? 'No artist matches that search.' : 'The catalogue names no artists.'}
            />
          }
        />
      ) : artists.error instanceof NotFoundError ? (
        <EmptyState
          title="Not on this server yet"
          message="Artist pages need PokeCollector 1.59.0 or later on the server."
        />
      ) : artists.error ? (
        <ErrorState error={artists.error} onRetry={() => artists.refetch()} />
      ) : (
        <ListSkeleton />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  controls: { padding: spacing.md, paddingBottom: spacing.sm },
  thumb: { width: 36, height: 50, borderRadius: radius.sm },
  more: { padding: spacing.lg },
});
