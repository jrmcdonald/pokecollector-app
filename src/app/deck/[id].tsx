import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import type { Deck } from '@/api/schemas';
import { Button } from '@/components/button';
import { DeckEntryRow } from '@/components/deck-entry-row';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAddDeckToCollection, useDeck, useIsOnline } from '@/hooks/queries';
import { useOwnerLabel } from '@/hooks/use-owner-label';
import { usePrefetchCardImages } from '@/hooks/use-prefetch-card-images';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { spacing, useColors } from '@/theme';
import { deckSummary, isRealDeck } from '@/utils/decks';
import { showToast } from '@/utils/toast';

/**
 * A deck's cards. A planned deck says what is missing, and can be added to
 * the collection in one go, for a prebuilt deck bought after it was planned.
 */
export default function DeckDetail() {
  const { id = '', name } = useLocalSearchParams<{ id: string; name?: string }>();
  const colors = useColors();
  const deck = useDeck(Number(id));
  usePrefetchCardImages(deck.data?.entries);
  const pull = usePullToRefresh(() => deck.refetch());
  const data = deck.data;

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: data?.name ?? name ?? '' }} />
      {data ? (
        <FlashList
          data={data.entries ?? []}
          keyExtractor={(entry) => String(entry.id)}
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          ListHeaderComponent={<Summary deck={data} />}
          renderItem={({ item }) => <DeckEntryRow deck={data} entry={item} />}
          ListEmptyComponent={
            <EmptyState
              title="This deck has no cards"
              message="Add cards to it in the PokeCollector web UI."
            />
          }
        />
      ) : deck.error ? (
        <ErrorState error={deck.error} onRetry={() => deck.refetch()} />
      ) : (
        <ListSkeleton />
      )}
    </ThemedView>
  );
}

function Summary({ deck }: { deck: Deck }) {
  const online = useIsOnline();
  const add = useAddDeckToCollection();
  const owner = useOwnerLabel();
  const count = (deck.entries ?? []).reduce((sum, entry) => sum + entry.required_quantity, 0);
  const planned = !isRealDeck(deck);

  const confirmAdd = () =>
    Alert.alert(
      `Add ${count} cards?`,
      `Every card in this deck is added to ${owner ?? 'your collection'}, and the deck becomes a Real Deck of those copies.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: () =>
            add.mutate(deck, {
              onSuccess: ({ real, added }) =>
                showToast(
                  real
                    ? {
                        kind: 'success',
                        title: `Added ${count} cards`,
                        message: 'This is now a Real Deck.',
                      }
                    : {
                        kind: 'info',
                        title: added.failed ? `${added.failed} cards could not be added` : 'Added',
                        message:
                          'The deck stays planned: some copies are missing or in another deck.',
                      },
                ),
            }),
        },
      ],
    );

  return (
    <View style={styles.header}>
      <ThemedText color="textSecondary">{deckSummary(deck)}</ThemedText>
      {planned && count > 0 ? (
        <Button
          title="Add all to the collection"
          variant="secondary"
          busy={add.isPending}
          disabled={!online}
          onPress={confirmAdd}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { padding: spacing.md, gap: spacing.sm },
});
