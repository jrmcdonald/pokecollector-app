import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedView } from '@/components/themed-view';
import { useDecks, useIsOnline } from '@/hooks/queries';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { radius, spacing, useColors } from '@/theme';
import { binderColor } from '@/utils/binders';
import { deckSummary } from '@/utils/decks';

export default function Decks() {
  const colors = useColors();
  const online = useIsOnline();
  const decks = useDecks();
  const pull = usePullToRefresh(() => decks.refetch());
  const addDeck = () => router.push('/deck-import');

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () =>
            online
              ? [
                  {
                    type: 'button',
                    label: 'Add',
                    accessibilityLabel: 'Add a prebuilt deck',
                    icon: { type: 'sfSymbol', name: 'plus' },
                    onPress: addDeck,
                  },
                ]
              : [],
        }}
      />
      {decks.data ? (
        <FlashList
          data={decks.data}
          keyExtractor={(deck) => String(deck.id)}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          renderItem={({ item: deck }) => (
            <ListRow
              title={deck.name}
              subtitle={deckSummary(deck)}
              leading={
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: binderColor(deck, colors.accent),
                      borderColor: colors.border,
                    },
                  ]}
                />
              }
              onPress={() =>
                router.push({
                  pathname: '/deck/[id]',
                  params: { id: String(deck.id), name: deck.name },
                })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No decks yet"
              message="Paste a prebuilt deck’s list to add its cards and make a deck of them. Decks built in the web UI show up here too."
              action={online ? { title: 'Add a prebuilt deck', onPress: addDeck } : undefined}
            />
          }
          ListFooterComponent={
            decks.data.length > 0 && online ? (
              <View style={styles.footer}>
                <Button title="Add a prebuilt deck" variant="secondary" onPress={addDeck} />
              </View>
            ) : null
          }
        />
      ) : decks.error ? (
        <ErrorState error={decks.error} onRetry={() => decks.refetch()} />
      ) : (
        <ListSkeleton />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  swatch: { width: 14, height: 40, borderRadius: radius.sm / 2, borderWidth: 1 },
  footer: { padding: spacing.md },
});
