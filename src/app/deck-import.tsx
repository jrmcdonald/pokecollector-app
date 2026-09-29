import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Deck } from '@/api/schemas';
import { Button } from '@/components/button';
import { CardSearchPane } from '@/components/card-search-pane';
import { DeckEntryRow } from '@/components/deck-entry-row';
import { ListRow } from '@/components/list-row';
import { ErrorState, ListSkeleton } from '@/components/states';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useAddDeckEntry,
  useAddDeckToCollection,
  useDeck,
  useDeleteDeck,
  useImportDecklist,
  useIsOnline,
} from '@/hooks/queries';
import { useOwnerLabel } from '@/hooks/use-owner-label';
import { minTapTarget, spacing, useColors } from '@/theme';
import { lineCode, parseDecklist, type DeckLine } from '@/utils/decklist';
import { showToast } from '@/utils/toast';

const EXAMPLE = 'Pikachu ex SVI 57';

/**
 * Adds a prebuilt deck from its list. Pasting and looking the cards up makes
 * a planned deck, which is the preview: nothing is added to the collection
 * until "Add". Cancelling from the review deletes the planned deck.
 */
export default function DeckImport() {
  const [imported, setImported] = useState<{ deckId: number; unresolved: DeckLine[] } | null>(null);
  return imported ? (
    <Review deckId={imported.deckId} unresolved={imported.unresolved} />
  ) : (
    <Paste onImported={setImported} />
  );
}

function Paste({
  onImported,
}: {
  onImported(result: { deckId: number; unresolved: DeckLine[] }): void;
}) {
  const online = useIsOnline();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseDecklist(text), [text]);
  const importList = useImportDecklist();
  const ready = online && name.trim().length > 0 && parsed.cards.length > 0;

  const lookUp = () =>
    importList.mutate(
      { name: name.trim(), cards: parsed.cards },
      { onSuccess: ({ deck, unresolved }) => onImported({ deckId: deck.id, unresolved }) },
    );

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: 'Add a prebuilt deck' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        <ThemedText color="textSecondary">
          Paste the deck’s list as Pokémon TCG Live exports it, one card a line, like “4 {EXAMPLE}”.
          Limitless and most deck sites offer the same text.
        </ThemedText>
        <TextField
          label="Deck name"
          value={name}
          onChangeText={setName}
          placeholder="Pikachu ex Battle Deck"
          autoCapitalize="words"
          returnKeyType="next"
        />
        <TextField
          label="Deck list"
          value={text}
          onChangeText={setText}
          placeholder={`4 ${EXAMPLE}\n2 Nest Ball SVI 181\n…`}
          multiline
          numberOfLines={10}
          style={styles.list}
          textAlignVertical="top"
          spellCheck={false}
        />
        {text.trim() ? <ParseSummary parsed={parsed} /> : null}
        <Button
          title="Look up the cards"
          busy={importList.isPending}
          disabled={!ready}
          onPress={lookUp}
        />
        {!online ? (
          <ThemedText variant="caption" color="textSecondary">
            Looking up the cards needs a connection.
          </ThemedText>
        ) : (
          <ThemedText variant="caption" color="textSecondary">
            This makes a planned deck to check before anything is added to your collection.
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function ParseSummary({ parsed }: { parsed: ReturnType<typeof parseDecklist> }) {
  const lines = parsed.cards.length;
  return (
    <View style={styles.summary}>
      <ThemedText variant="label">
        {parsed.total === 1 ? '1 card' : `${parsed.total} cards`} on{' '}
        {lines === 1 ? '1 line' : `${lines} lines`}
      </ThemedText>
      {parsed.unreadable.map((line) => (
        <ThemedText key={line.line} variant="caption" color="textSecondary">
          Not read: line {line.line}, “{line.text}”
        </ThemedText>
      ))}
    </View>
  );
}

function Review({ deckId, unresolved }: { deckId: number; unresolved: DeckLine[] }) {
  const colors = useColors();
  const online = useIsOnline();
  const deck = useDeck(deckId);
  const remove = useDeleteDeck();
  const [handled, setHandled] = useState<ReadonlySet<number>>(new Set());
  const [finding, setFinding] = useState<DeckLine | null>(null);
  const missing = unresolved.filter((line) => !handled.has(line.line));
  const done = (line: DeckLine) => setHandled((set) => new Set(set).add(line.line));

  const discard = () =>
    Alert.alert(
      'Discard this deck?',
      'The planned deck is deleted. Nothing was added to your collection.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => remove.mutate(deckId, { onSuccess: () => router.back() }),
        },
      ],
    );

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          title: 'Check the deck',
          // Leaving has to be a choice: keep the planned deck, or discard it.
          gestureEnabled: false,
          headerBackVisible: false,
          unstable_headerLeftItems: () => [
            {
              type: 'button',
              label: 'Discard',
              accessibilityLabel: 'Discard this deck',
              onPress: discard,
            },
          ],
        }}
      />
      {deck.data ? (
        <SafeAreaView edges={['bottom']} style={styles.fill}>
          <FlashList
            data={deck.data.entries ?? []}
            keyExtractor={(entry) => String(entry.id)}
            ListHeaderComponent={
              <View style={styles.header}>
                <Found deck={deck.data} />
                {missing.length > 0 ? (
                  <View>
                    <ThemedText variant="heading" style={styles.sectionTitle}>
                      Not found
                    </ThemedText>
                    <ThemedText color="textSecondary" style={styles.sectionNote}>
                      Tap a card to find it, or leave it out.
                    </ThemedText>
                    {missing.map((line) => (
                      <ListRow
                        key={line.line}
                        title={line.name}
                        subtitle={[
                          `Line ${line.line}`,
                          lineCode(line) ?? 'no set given',
                          `${line.quantity} ${line.quantity === 1 ? 'copy' : 'copies'}`,
                        ].join(' · ')}
                        kind="action"
                        trailing={
                          <ThemedText variant="label" style={{ color: colors.accent }}>
                            Find
                          </ThemedText>
                        }
                        onPress={() => setFinding(line)}
                      />
                    ))}
                  </View>
                ) : null}
                {deck.data.entries?.length ? (
                  <ThemedText variant="heading" style={styles.sectionTitle}>
                    In the deck
                  </ThemedText>
                ) : null}
              </View>
            }
            renderItem={({ item }) => <DeckEntryRow deck={deck.data} entry={item} />}
            ListFooterComponent={<Confirm deck={deck.data} online={online} leftOut={missing} />}
          />
        </SafeAreaView>
      ) : deck.error ? (
        <ErrorState error={deck.error} onRetry={() => deck.refetch()} />
      ) : (
        <ListSkeleton />
      )}
      <FindSheet
        deckId={deckId}
        line={finding}
        onClose={() => setFinding(null)}
        onDone={(line) => {
          done(line);
          setFinding(null);
        }}
      />
    </ThemedView>
  );
}

function Found({ deck }: { deck: Deck }) {
  const count = (deck.entries ?? []).reduce((sum, entry) => sum + entry.required_quantity, 0);
  const missing = deck.missing_copy_count ?? 0;
  return (
    <View
      style={styles.found}
      accessible
      accessibilityLabel={`${deck.name}: ${count} cards found${missing ? `, ${missing} not yet owned` : ''}`}>
      <ThemedText variant="figure">{count === 1 ? '1 card' : `${count} cards`} found</ThemedText>
      <ThemedText color="textSecondary">
        {deck.name}
        {missing ? ` · ${missing} not yet owned` : ''}
      </ThemedText>
    </View>
  );
}

function Confirm({ deck, online, leftOut }: { deck: Deck; online: boolean; leftOut: DeckLine[] }) {
  const add = useAddDeckToCollection();
  const owner = useOwnerLabel();
  const count = (deck.entries ?? []).reduce((sum, entry) => sum + entry.required_quantity, 0);
  const open = (title: string, message: string, kind: 'success' | 'info' = 'success') => {
    showToast({ kind, title, message });
    router.replace({ pathname: '/deck/[id]', params: { id: String(deck.id), name: deck.name } });
  };

  const addAll = () =>
    add.mutate(deck, {
      onSuccess: ({ real, added }) =>
        real
          ? open(`Added ${count} cards`, 'The deck is a Real Deck of those copies.')
          : open(
              added.failed ? `${added.failed} cards could not be added` : `Added ${count} cards`,
              'The deck stays planned: some copies are missing or in another deck.',
              'info',
            ),
    });

  return (
    <View style={styles.confirm}>
      {leftOut.length > 0 ? (
        <ThemedText variant="caption" color="textSecondary">
          {leftOut.length === 1 ? '1 line' : `${leftOut.length} lines`} not found will be left out.
        </ThemedText>
      ) : null}
      <Button
        title={`Add ${count} cards to ${owner ?? 'the collection'}`}
        busy={add.isPending}
        disabled={!online || count === 0}
        onPress={addAll}
      />
      <Button
        title="Keep as a planned deck"
        variant="secondary"
        disabled={add.isPending}
        onPress={() => open('Saved as a planned deck', 'Nothing was added to your collection.')}
      />
      <ThemedText variant="caption" color="textSecondary">
        Adding puts every copy in your collection as Near Mint and makes this a Real Deck of them.
      </ThemedText>
    </View>
  );
}

/** Finds a line the import could not, in the catalogue, and puts it in the deck. */
function FindSheet({
  deckId,
  line,
  onClose,
  onDone,
}: {
  deckId: number;
  line: DeckLine | null;
  onClose(): void;
  onDone(line: DeckLine): void;
}) {
  const colors = useColors();
  const addEntry = useAddDeckEntry();
  return (
    <Modal
      visible={line !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <ThemedView style={styles.fill}>
        {line ? (
          <SafeAreaView edges={['bottom']} style={styles.fill}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <ThemedText variant="heading" accessibilityRole="header" style={styles.fill}>
                {line.name}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                style={styles.close}>
                <ThemedText variant="label" style={{ color: colors.accent }}>
                  Close
                </ThemedText>
              </Pressable>
            </View>
            <CardSearchPane
              key={line.line}
              initial={line.name}
              cancelTitle="Leave this card out"
              onCancel={() => onDone(line)}
              onPick={(card) =>
                addEntry.mutate(
                  { deckId, cardId: card.id, quantity: Math.min(line.quantity, 99) },
                  { onSuccess: () => onDone(line) },
                )
              }
            />
          </SafeAreaView>
        ) : null}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  list: { minHeight: 200, fontVariant: ['tabular-nums'] },
  summary: { gap: spacing.xs },
  header: { gap: spacing.md, paddingTop: spacing.md },
  found: { paddingHorizontal: spacing.md, gap: spacing.xs },
  sectionTitle: { paddingHorizontal: spacing.md },
  sectionNote: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  confirm: { padding: spacing.md, gap: spacing.sm },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: {
    minWidth: 64,
    minHeight: minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
