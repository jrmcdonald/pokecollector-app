import { FlashList } from '@shopify/flash-list';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import type { Deck } from '@/api/schemas';
import { Button } from '@/components/button';
import { CardPickerSheet } from '@/components/card-picker-sheet';
import { DeckEntryRow, EditableDeckEntryRow } from '@/components/deck-entry-row';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useAddDeckEntry,
  useAddDeckToCollection,
  useDeck,
  useDeleteDeck,
  useIsOnline,
  useRenameDeck,
  useSetDeckEntryQuantity,
} from '@/hooks/queries';
import { useOwnerLabel } from '@/hooks/use-owner-label';
import { usePrefetchCardImages } from '@/hooks/use-prefetch-card-images';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { spacing, useColors } from '@/theme';
import { deckSummary, isRealDeck } from '@/utils/decks';
import { showToast } from '@/utils/toast';

/**
 * A deck's cards. A planned deck says what is missing, and can be added to
 * the collection in one go, for a prebuilt deck bought after it was planned.
 * Edit changes how many copies of each card the deck lists, adds and takes
 * out cards, renames the deck or deletes it.
 */
export default function DeckDetail() {
  const { id = '', name } = useLocalSearchParams<{ id: string; name?: string }>();
  const deckId = Number(id);
  const colors = useColors();
  const online = useIsOnline();
  const deck = useDeck(deckId);
  usePrefetchCardImages(deck.data?.entries);
  const pull = usePullToRefresh(() => deck.refetch());
  const setQuantity = useSetDeckEntryQuantity(deckId);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const data = deck.data;
  const isEditing = editing && online;

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          title: data?.name ?? name ?? '',
          unstable_headerRightItems: () =>
            data && online
              ? [
                  {
                    type: 'button',
                    label: isEditing ? 'Done' : 'Edit',
                    accessibilityLabel: isEditing ? 'Done editing' : 'Edit this deck',
                    onPress: () => setEditing(!isEditing),
                  },
                ]
              : [],
        }}
      />
      {data ? (
        <FlashList
          // No recycle pool: an editing row holds copies not yet saved, and a
          // recycled cell would carry them over to another card.
          maxItemsInRecyclePool={0}
          data={data.entries ?? []}
          keyExtractor={(entry) => String(entry.id)}
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          ListHeaderComponent={
            isEditing ? (
              <EditHeader deck={data} onAdd={() => setAdding(true)} />
            ) : (
              <Summary deck={data} />
            )
          }
          renderItem={({ item }) =>
            isEditing ? (
              <EditableDeckEntryRow
                deck={data}
                entry={item}
                onChange={(quantity) => setQuantity.mutate({ entryId: item.id, quantity })}
              />
            ) : (
              <DeckEntryRow deck={data} entry={item} />
            )
          }
          ListEmptyComponent={
            <EmptyState
              title="This deck has no cards"
              message={isEditing ? 'Add cards with “Add a card”.' : 'Add cards to it with Edit.'}
            />
          }
          ListFooterComponent={isEditing ? <DeleteDeck deck={data} /> : null}
        />
      ) : deck.error ? (
        <ErrorState error={deck.error} onRetry={() => deck.refetch()} />
      ) : (
        <ListSkeleton />
      )}
      {data ? <AddCardSheet deck={data} visible={adding} onClose={() => setAdding(false)} /> : null}
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

/** Above the cards while editing: what the deck adds up to, its name, and adding a card. */
function EditHeader({ deck, onAdd }: { deck: Deck; onAdd(): void }) {
  const rename = useRenameDeck();
  const askName = () =>
    Alert.prompt(
      'Rename the deck',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: (text?: string) => {
            const next = text?.trim().slice(0, 255);
            if (next && next !== deck.name) rename.mutate({ deckId: deck.id, name: next });
          },
        },
      ],
      'plain-text',
      deck.name,
    );

  return (
    <View style={styles.header}>
      <ThemedText color="textSecondary">{deckSummary(deck)}</ThemedText>
      <ThemedText variant="caption" color="textSecondary">
        {isRealDeck(deck)
          ? 'A Real Deck holds owned copies: more copies of a card need spare ones, not already in another deck. Fewer leave them in your collection.'
          : 'Change how many copies the deck lists. Taking a card down to 0 takes it out of the deck.'}
      </ThemedText>
      <View style={styles.actions}>
        <Button title="Add a card" variant="secondary" onPress={onAdd} style={styles.action} />
        <Button
          title="Rename"
          variant="secondary"
          busy={rename.isPending}
          onPress={askName}
          style={styles.action}
        />
      </View>
    </View>
  );
}

/** Finds a card in the catalogue and puts one copy of it in the deck, or one more. */
function AddCardSheet({
  deck,
  visible,
  onClose,
}: {
  deck: Deck;
  visible: boolean;
  onClose(): void;
}) {
  const addEntry = useAddDeckEntry();
  return (
    <CardPickerSheet
      visible={visible}
      title={`Add to ${deck.name}`}
      onClose={onClose}
      onPick={(card) =>
        addEntry.mutate(
          { deckId: deck.id, cardId: card.id, quantity: 1 },
          {
            onSuccess: () => {
              onClose();
              showToast({ kind: 'success', title: `${card.name} added`, message: deck.name });
            },
          },
        )
      }
    />
  );
}

function DeleteDeck({ deck }: { deck: Deck }) {
  const remove = useDeleteDeck();
  const confirm = () =>
    Alert.alert(
      `Delete ${deck.name}?`,
      isRealDeck(deck)
        ? 'The deck is deleted. Its cards stay in your collection, free for other decks.'
        : 'The deck is deleted. Nothing in your collection changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(deck.id, {
              onSuccess: () => {
                showToast({ kind: 'success', title: `${deck.name} deleted` });
                router.back();
              },
            }),
        },
      ],
    );
  return (
    <View style={styles.footer}>
      <Button title="Delete deck" variant="destructive" busy={remove.isPending} onPress={confirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { padding: spacing.md, gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1 },
  footer: { padding: spacing.md, paddingTop: spacing.xl },
});
