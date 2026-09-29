import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import type { SearchCard } from '@/api/schemas';
import { useCardSearch } from '@/hooks/queries';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { spacing, useColors } from '@/theme';

import { Button } from './button';
import { CardImage } from './card-image';
import { ListRow } from './list-row';
import { SearchField } from './search-field';
import { EmptyState, ErrorState } from './states';

/** The same wait as the Search tab: one request per word typed, not per letter. */
const DEBOUNCE_MS = 400;

/**
 * The catalogue search inside a sheet, so the screen under it keeps its
 * place: a batch's photo, or a deck line the import could not find.
 */
export function CardSearchPane({
  initial,
  onPick,
  onCancel,
  cancelTitle = 'Back to the matches',
}: {
  initial: string;
  onPick(card: SearchCard): void;
  onCancel?: () => void;
  cancelTitle?: string;
}) {
  const colors = useColors();
  const [text, setText] = useState(initial);
  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const search = useCardSearch(query);
  const results = query.length >= 2 ? (search.data?.pages.flatMap((p) => p.data) ?? []) : [];

  return (
    <FlatList
      data={results}
      keyExtractor={(card) => card.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.searchList}
      ListHeaderComponent={
        <View style={styles.searchHeader}>
          <SearchField
            value={text}
            onChangeText={setText}
            placeholder="Card name, or a code like PFL 001"
            accessibilityLabel="Search the catalogue"
          />
          {onCancel ? <Button title={cancelTitle} variant="secondary" onPress={onCancel} /> : null}
        </View>
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (search.hasNextPage && !search.isFetchingNextPage) search.fetchNextPage();
      }}
      renderItem={({ item: card }) => {
        const code = [card.set_ref?.abbreviation ?? card.set_id?.toUpperCase(), card.number]
          .filter(Boolean)
          .join(' ');
        return (
          <ListRow
            title={card.name}
            subtitle={[code, card.rarity].filter(Boolean).join(' · ')}
            leading={<CardImage card={card} size="small" style={styles.resultImage} />}
            kind="action"
            accessibilityLabel={[card.name, code, card.rarity, 'Use this card']
              .filter(Boolean)
              .join(', ')}
            onPress={() => onPick(card)}
          />
        );
      }}
      ListFooterComponent={
        search.isFetchingNextPage ? (
          <ActivityIndicator style={styles.footer} color={colors.textSecondary} />
        ) : null
      }
      ListEmptyComponent={
        query.length < 2 ? (
          <EmptyState title="Search the catalogue" message="Type a name or a set code." />
        ) : search.error ? (
          <ErrorState error={search.error} onRetry={() => search.refetch()} />
        ) : !search.data ? (
          <ActivityIndicator style={styles.footer} color={colors.textSecondary} />
        ) : (
          <EmptyState title="No cards found" message={`Nothing matches “${query}”.`} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  searchList: { paddingBottom: spacing.lg },
  searchHeader: { padding: spacing.md, gap: spacing.sm },
  resultImage: { width: 40 },
  footer: { padding: spacing.lg },
});
