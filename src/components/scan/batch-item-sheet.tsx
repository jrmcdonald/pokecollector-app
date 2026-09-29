import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { itemState, type BatchChoice } from '@/api/batch';
import { searchTermFor } from '@/api/scan';
import { candidatesOf, type ScanItem, type SearchCard } from '@/api/schemas';
import { Button } from '@/components/button';
import { CardImage } from '@/components/card-image';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { SearchField } from '@/components/search-field';
import { EmptyState, ErrorState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCardSearch } from '@/hooks/queries';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { spacing, useColors } from '@/theme';
import { photoName, pickCard } from '@/utils/batch-review';

import { CopyDetailsFields } from './copy-details';
import { ScanCandidates } from './scan-candidates';
import { ScanPhoto } from './scan-photo';

/** The same wait as the Search tab: one request per word typed, not per letter. */
const DEBOUNCE_MS = 400;

/**
 * One photo of a batch, opened: the photo beside the chosen card, the other
 * candidates, a search for when none is right, and how the card goes in.
 * Changes apply as they are made; the batch's "Add all" adds them.
 */
export function BatchItemSheet({
  jobId,
  item,
  choice,
  onChange,
  onClose,
  onSkip,
  onRetry,
  busy,
  online,
}: {
  jobId: number;
  /** The photo to show; the sheet is hidden while this is null. */
  item: ScanItem | null;
  choice: BatchChoice | null;
  onChange(choice: BatchChoice): void;
  onClose(): void;
  onSkip(item: ScanItem): void;
  onRetry(item: ScanItem): void;
  /** A skip or retry of this photo is in flight. */
  busy: boolean;
  online: boolean;
}) {
  return (
    <Modal
      visible={item !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <ThemedView style={styles.fill}>
        {item && choice ? (
          <SheetContent
            // A fresh search and scroll position for each photo.
            key={item.id}
            jobId={jobId}
            item={item}
            choice={choice}
            onChange={onChange}
            onClose={onClose}
            onSkip={onSkip}
            onRetry={onRetry}
            busy={busy}
            online={online}
          />
        ) : null}
      </ThemedView>
    </Modal>
  );
}

function SheetContent({
  jobId,
  item,
  choice,
  onChange,
  onClose,
  onSkip,
  onRetry,
  busy,
  online,
}: {
  jobId: number;
  item: ScanItem;
  choice: BatchChoice;
  onChange(choice: BatchChoice): void;
  onClose(): void;
  onSkip(item: ScanItem): void;
  onRetry(item: ScanItem): void;
  busy: boolean;
  online: boolean;
}) {
  const colors = useColors();
  const candidates = candidatesOf(item);
  const state = itemState(item);
  const [searching, setSearching] = useState(candidates.length === 0);
  const picked = choice.pick ? pickCard(choice.pick) : null;

  const skip = () =>
    Alert.alert(
      'Skip this photo?',
      'Nothing is added for it, and PokeCollector deletes the photo.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: () => onSkip(item) },
      ],
    );

  const pickFromSearch = (card: SearchCard) => {
    onChange({ ...choice, pick: { kind: 'search', card } });
    setSearching(false);
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <ThemedText variant="heading" accessibilityRole="header" style={styles.flex}>
          {photoName(item)}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={onClose}
          style={styles.done}>
          <ThemedText variant="label" style={{ color: colors.accent }}>
            Done
          </ThemedText>
        </Pressable>
      </View>

      {searching ? (
        <SearchPane
          initial={searchTermFor(item.recognized)}
          onPick={pickFromSearch}
          onCancel={candidates.length > 0 || picked ? () => setSearching(false) : undefined}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.compare}>
            <View style={styles.compareSide}>
              <ScanPhoto jobId={jobId} item={item} remote />
              <ThemedText variant="caption" color="textSecondary" style={styles.centred}>
                Your photo
              </ThemedText>
            </View>
            <View style={styles.compareSide}>
              {picked ? (
                <CardImage card={picked} size="large" />
              ) : (
                <View
                  style={[
                    styles.nothing,
                    { borderColor: colors.outline, backgroundColor: colors.surface },
                  ]}>
                  <Icon name="questionmark" size={20} color="textSecondary" />
                </View>
              )}
              <ThemedText variant="caption" color="textSecondary" style={styles.centred}>
                {picked ? `${picked.name}${picked.code ? `, ${picked.code}` : ''}` : 'No card yet'}
              </ThemedText>
            </View>
          </View>

          {state === 'failed' ? (
            <ThemedText color="textSecondary">
              {item.error || 'The scanner could not read this card.'}
            </ThemedText>
          ) : null}
          {state === 'unmatched' && !picked ? (
            <ThemedText color="textSecondary">
              The scanner read the card but found no match in the catalogue.
            </ThemedText>
          ) : null}

          {candidates.length > 0 ? (
            <ScanCandidates
              candidates={candidates}
              recognized={item.recognized}
              selectedId={choice.pick?.kind === 'candidate' ? choice.pick.match.id : null}
              onPick={(match) => onChange({ ...choice, pick: { kind: 'candidate', match } })}
            />
          ) : null}
          <Button
            title={candidates.length > 0 ? 'None of these: search' : 'Search for it'}
            variant="secondary"
            onPress={() => setSearching(true)}
          />

          {picked ? (
            <CopyDetailsFields
              value={choice}
              onChange={(details) => onChange({ ...choice, ...details })}
            />
          ) : null}

          <View style={styles.actions}>
            {state === 'failed' && item.has_image !== false ? (
              <Button
                title="Try this photo again"
                variant="secondary"
                busy={busy}
                disabled={!online}
                onPress={() => onRetry(item)}
              />
            ) : null}
            <Button
              title="Skip this photo"
              variant="secondary"
              disabled={busy || !online}
              onPress={skip}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * The catalogue search, inside the sheet so the review keeps its place. A
 * card picked here is added with a plain collection add, and the photo is
 * then marked handled, since upstream only confirms its own candidates.
 */
function SearchPane({
  initial,
  onPick,
  onCancel,
}: {
  initial: string;
  onPick(card: SearchCard): void;
  onCancel?: () => void;
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
          {onCancel ? (
            <Button title="Back to the matches" variant="secondary" onPress={onCancel} />
          ) : null}
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
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  done: {
    minWidth: 64,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  content: { padding: spacing.md, gap: spacing.md },
  compare: { flexDirection: 'row', gap: spacing.md },
  compareSide: { flex: 1, gap: spacing.xs },
  centred: { textAlign: 'center' },
  nothing: {
    aspectRatio: 63 / 88,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: spacing.sm },
  searchList: { paddingBottom: spacing.lg },
  searchHeader: { padding: spacing.md, gap: spacing.sm },
  resultImage: { width: 40 },
  footer: { padding: spacing.lg },
});
