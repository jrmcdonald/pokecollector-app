import { FlashList } from '@shopify/flash-list';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import type { Binder, BinderCard, BinderCards } from '@/api/schemas';
import { Button } from '@/components/button';
import { CardPickerSheet } from '@/components/card-picker-sheet';
import { CardTile } from '@/components/card-tile';
import { EditableCardRow } from '@/components/editable-card-row';
import { ProgressBar } from '@/components/progress-bar';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useBinderCards,
  useCollection,
  useDeleteBinder,
  useIsOnline,
  useRemoveFromBinder,
  useSetBinderEntryQuantity,
  useUpdateBinder,
} from '@/hooks/queries';
import { useAddCardToBinder } from '@/hooks/use-add-card-to-binder';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useCardColumns } from '@/hooks/use-large-text';
import { spacing, useColors } from '@/theme';
import { BINDER_COLORS, binderColorName, isPlanned } from '@/utils/binders';
import { entriesForCard } from '@/utils/collection';
import { pick } from '@/utils/pick';
import { formatPrice, formatTotal } from '@/utils/pricing';
import { completion } from '@/utils/sets';
import { showToast } from '@/utils/toast';

/**
 * One binder's cards. Planned binders mark what is still missing; collection
 * binders only ever hold owned copies. Holding a card offers to take it out
 * of the binder (it stays in the collection). Edit changes how many copies
 * of each card the binder holds, adds and takes out cards, renames the
 * binder, changes its colour or deletes it.
 */
export default function BinderDetail() {
  const { id = '', name } = useLocalSearchParams<{ id: string; name?: string }>();
  const binderId = Number(id);
  const columns = useCardColumns();
  const colors = useColors();
  const online = useIsOnline();
  const binder = useBinderCards(binderId);
  const pull = usePullToRefresh(() => binder.refetch());
  const remove = useRemoveFromBinder();
  const setQuantity = useSetBinderEntryQuantity(binderId);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const data = binder.data;
  const planned = data ? isPlanned(data.binder) : false;
  const isEditing = editing && online;

  // Chosen from the long-press sheet, which is already the deliberate second
  // step, so no confirmation: the copy stays in the collection either way.
  function removeCard(card: BinderCard) {
    if (!online) {
      showToast({ kind: 'info', title: 'Offline', message: 'Changes need a connection.' });
      return;
    }
    remove.mutate(
      { binderId, binderCardId: card.binder_card_id },
      {
        onSuccess: () =>
          showToast({
            kind: 'success',
            title: `${card.name} taken out of the binder`,
            message: 'It is still in your collection.',
          }),
      },
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          title: data?.binder.name ?? name ?? '',
          unstable_headerRightItems: () =>
            data && online
              ? [
                  {
                    type: 'button',
                    label: isEditing ? 'Done' : 'Edit',
                    accessibilityLabel: isEditing ? 'Done editing' : 'Edit this binder',
                    onPress: () => setEditing(!isEditing),
                  },
                ]
              : [],
        }}
      />
      {data ? (
        <FlashList
          // No recycle pool: FlashList 2.0.2 keeps cells past the end of a list
          // that shrank, showing their old items (a set searched for "char"
          // still showed what "c" found), and an editing row holds copies not
          // yet saved, which a recycled cell would carry over to another card.
          maxItemsInRecyclePool={0}
          data={data.cards}
          // A new list when the text size changes the columns, or editing
          // turns the tiles into rows: FlashList cannot change them in place.
          key={isEditing ? 'editing' : columns}
          numColumns={isEditing ? 1 : columns}
          keyExtractor={(card) => String(card.binder_card_id)}
          contentContainerStyle={isEditing ? undefined : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          ListHeaderComponent={
            isEditing ? (
              <EditHeader data={data} planned={planned} onAdd={() => setAdding(true)} />
            ) : (
              <Summary data={data} planned={planned} />
            )
          }
          renderItem={({ item: card }) =>
            isEditing ? (
              <EditableCardRow
                card={card}
                detail={
                  planned
                    ? [
                        card.number,
                        card.missing_quantity ? `${card.missing_quantity} missing` : null,
                      ]
                    : [card.variant, card.condition]
                }
                quantity={card.required_quantity ?? 1}
                photoItemId={card.has_scan_photo ? card.collection_item_id : null}
                onChange={(quantity) =>
                  setQuantity.mutate({ binderCardId: card.binder_card_id, quantity })
                }
              />
            ) : (
              <CardTile
                layout={columns === 1 ? 'row' : 'tile'}
                card={card}
                detail={[card.variant, formatPrice(card.price_market)].filter(Boolean).join(' · ')}
                quantity={
                  card.required_quantity && card.required_quantity > 1 ? card.required_quantity : 0
                }
                missing={planned && !card.owned}
                variant={card.variant}
                photoItemId={card.has_scan_photo ? card.collection_item_id : null}
                actions={[
                  {
                    name: 'remove',
                    label: 'Take out of binder',
                    destructive: true,
                    onAction: () => removeCard(card),
                  },
                ]}
              />
            )
          }
          ListEmptyComponent={
            <EmptyState
              title="This binder is empty"
              message={
                isEditing
                  ? 'Add cards with “Add a card”.'
                  : 'Add cards with Edit, or from a card’s page with “Add to binder”.'
              }
            />
          }
          ListFooterComponent={isEditing ? <DeleteBinder binder={data.binder} /> : null}
        />
      ) : binder.error ? (
        <ErrorState error={binder.error} onRetry={() => binder.refetch()} />
      ) : (
        <GridSkeleton />
      )}
      {data ? (
        <AddCardSheet binder={data.binder} visible={adding} onClose={() => setAdding(false)} />
      ) : null}
    </ThemedView>
  );
}

function Summary({ data, planned }: { data: BinderCards; planned: boolean }) {
  const owned = data.owned_count ?? 0;
  const total = data.total_count ?? data.cards.length;
  return (
    <View style={styles.header}>
      {planned ? (
        <>
          <View
            style={styles.row}
            accessible
            accessibilityLabel={`${owned} of ${total} owned, ${Math.round(completion(owned, total) * 100)} percent, ${formatTotal(data.cost_to_complete ?? 0)} to complete`}>
            <ThemedText variant="figure">
              {owned}
              <ThemedText variant="figureSmall" color="textSecondary">
                {' '}
                / {total}
              </ThemedText>
            </ThemedText>
            <ThemedText variant="caption" color="textSecondary">
              {formatTotal(data.cost_to_complete ?? 0)} to complete
            </ThemedText>
          </View>
          <ProgressBar value={completion(owned, total)} height={8} decorative />
        </>
      ) : (
        <View style={styles.row}>
          <ThemedText variant="figure">{total === 1 ? '1 card' : `${total} cards`}</ThemedText>
          <ThemedText variant="figureSmall" color="textSecondary">
            {formatTotal(data.current_value ?? 0)}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

/** Above the cards while editing: what changing the copies does, the name, colour and adding a card. */
function EditHeader({
  data,
  planned,
  onAdd,
}: {
  data: BinderCards;
  planned: boolean;
  onAdd(): void;
}) {
  const update = useUpdateBinder();
  const binder = data.binder;

  const askName = () =>
    Alert.prompt(
      'Rename the binder',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: (text?: string) => {
            const next = text?.trim().slice(0, 255);
            if (next && next !== binder.name) {
              update.mutate({ binderId: binder.id, changes: { name: next } });
            }
          },
        },
      ],
      'plain-text',
      binder.name,
    );

  async function askColor() {
    const current = binderColorName(binder);
    const index = await pick(
      'Binder colour',
      BINDER_COLORS.map((c) => (c.name === current ? `${c.name} (current)` : c.name)),
    );
    const color = index === null ? undefined : BINDER_COLORS[index];
    if (color && color.name !== current) {
      update.mutate({ binderId: binder.id, changes: { color: color.value } });
    }
  }

  return (
    <View style={styles.editHeader}>
      <ThemedText variant="caption" color="textSecondary">
        {planned
          ? 'Change how many copies the binder plans. Taking a card down to 0 takes it out of the binder.'
          : 'A binder holds owned copies: more copies need spare ones, not already in another binder. Taking a card down to 0 leaves it in your collection.'}
      </ThemedText>
      <View style={styles.actions}>
        <Button title="Add a card" variant="secondary" onPress={onAdd} style={styles.action} />
        <Button
          title="Rename"
          variant="secondary"
          busy={update.isPending && update.variables?.changes.name !== undefined}
          onPress={askName}
          style={styles.action}
        />
        <Button
          title="Colour"
          variant="secondary"
          busy={update.isPending && update.variables?.changes.color !== undefined}
          accessibilityHint={
            binderColorName(binder)
              ? `Currently ${binderColorName(binder)?.toLowerCase()}`
              : undefined
          }
          onPress={askColor}
          style={styles.action}
        />
      </View>
    </View>
  );
}

/**
 * Finds a card in the catalogue and puts it in the binder: for a collection
 * binder, one of the owned copies (see `useAddCardToBinder`).
 */
function AddCardSheet({
  binder,
  visible,
  onClose,
}: {
  binder: Binder;
  visible: boolean;
  onClose(): void;
}) {
  const add = useAddCardToBinder();
  const collection = useCollection();
  return (
    <CardPickerSheet
      visible={visible}
      title={`Add to ${binder.name}`}
      onClose={onClose}
      onPick={(card) =>
        add.addCard(binder, card.id, entriesForCard(collection.data, card.id), () => {
          onClose();
          showToast({ kind: 'success', title: `${card.name} added`, message: binder.name });
        })
      }
    />
  );
}

function DeleteBinder({ binder }: { binder: Binder }) {
  const remove = useDeleteBinder();
  const confirm = () =>
    Alert.alert(
      `Delete ${binder.name}?`,
      'The binder is deleted. Nothing in your collection changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(binder.id, {
              onSuccess: () => {
                showToast({ kind: 'success', title: `${binder.name} deleted` });
                router.back();
              },
            }),
        },
      ],
    );
  return (
    <View style={styles.footer}>
      <Button
        title="Delete binder"
        variant="destructive"
        busy={remove.isPending}
        onPress={confirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: spacing.sm },
  header: { padding: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  editHeader: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1 },
  footer: { padding: spacing.md, paddingTop: spacing.xl },
});
