import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { itemState, type BatchChoice } from '@/api/batch';
import { searchTermFor } from '@/api/scan';
import { candidatesOf, type ScanItem, type SearchCard } from '@/api/schemas';
import { Button } from '@/components/button';
import { CardImage } from '@/components/card-image';
import { CardSearchPane } from '@/components/card-search-pane';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAccessibilityText } from '@/hooks/use-large-text';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { spacing, useColors } from '@/theme';
import { photoName, pickCard } from '@/utils/batch-review';

import { CopyDetailsFields } from './copy-details';
import { ScanCandidates } from './scan-candidates';
import { ScanPhoto } from './scan-photo';

interface SheetProps {
  jobId: number;
  /** The photos that can be looked through, in order, the open one among them. */
  items: readonly ScanItem[];
  /** The photo to show; the sheet is hidden while this is null. */
  openId: number | null;
  choiceFor(item: ScanItem): BatchChoice;
  onChange(item: ScanItem, choice: BatchChoice): void;
  /** Swiped, or stepped, to another photo. */
  onOpen(item: ScanItem): void;
  onClose(): void;
  onSkip(item: ScanItem): void;
  onRetry(item: ScanItem): void;
  /** A skip or retry is in flight. */
  busy: boolean;
  online: boolean;
}

/**
 * The batch's photos, opened one at a time: the photo beside the chosen
 * card, the other candidates, a search for when none is right, and how the
 * card goes in. Swipe, or the arrows, for the next or previous photo.
 * Changes apply as they are made; the batch's "Add all" adds them.
 */
export function BatchItemSheet(props: SheetProps) {
  const open = props.items.find((item) => item.id === props.openId) ?? null;
  return (
    <Modal
      visible={open !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}>
      <ThemedView style={styles.fill}>{open ? <Pager {...props} open={open} /> : null}</ThemedView>
    </Modal>
  );
}

function Pager({
  jobId,
  items,
  open,
  choiceFor,
  onChange,
  onOpen,
  onClose,
  onSkip,
  onRetry,
  busy,
  online,
}: SheetProps & { open: ScanItem }) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const stacked = useAccessibilityText();
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  // A page sheet is narrower than the window on iPad.
  const width = measured ?? window.width;
  const list = useRef<FlatList<ScanItem>>(null);
  const shownId = useRef(open.id);
  // The photo that was tapped; only it opens straight into a search.
  const [firstId] = useState(open.id);
  const index = items.indexOf(open);
  const previous = items[index - 1];
  const next = items[index + 1];

  // Slide to a photo the arrows or a skip chose (a swipe is already there),
  // and keep the open one on screen when photos before it come or go.
  useEffect(() => {
    const moved = shownId.current !== open.id;
    shownId.current = open.id;
    list.current?.scrollToOffset({ offset: index * width, animated: moved && !reduceMotion });
  }, [open.id, index, width, reduceMotion]);

  const step = (item: ScanItem | undefined) => item && onOpen(item);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const landed = items[Math.round(event.nativeEvent.contentOffset.x / width)];
    if (landed && landed !== open) onOpen(landed);
  };

  const title = (
    <View style={styles.title}>
      <ThemedText variant="heading" accessibilityRole="header" style={styles.centred}>
        {photoName(open)}
      </ThemedText>
      {items.length > 1 ? (
        <ThemedText variant="caption" color="textSecondary">
          {index + 1} of {items.length}
        </ThemedText>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <View style={styles.header}>
          <StepButton
            icon="chevron.left"
            label="Previous photo"
            disabled={!previous}
            onPress={() => step(previous)}
          />
          {stacked ? <View style={styles.title} /> : title}
          <StepButton
            icon="chevron.right"
            label="Next photo"
            disabled={!next}
            onPress={() => step(next)}
          />
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
        {/* At the accessibility text sizes the title has a row of its own,
            rather than breaking "Photo 12" between the arrows. */}
        {stacked ? title : null}
      </View>
      <View style={styles.fill} onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}>
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(item) => String(item.id)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Pages draw from these as well as from `items`.
          extraData={{ open, choiceFor, busy, online }}
          initialScrollIndex={Math.max(0, index)}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          // The open photo and one either side.
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          onMomentumScrollEnd={settle}
          renderItem={({ item }) => (
            <View
              style={{ width }}
              // VoiceOver reads the photo on screen; the arrows reach the others.
              accessibilityElementsHidden={item !== open}
              importantForAccessibility={item === open ? 'auto' : 'no-hide-descendants'}>
              <SheetContent
                jobId={jobId}
                item={item}
                current={item === open}
                startSearching={item.id === firstId}
                choice={choiceFor(item)}
                onChange={(choice) => onChange(item, choice)}
                onSkip={onSkip}
                onRetry={onRetry}
                busy={busy}
                online={online}
              />
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevron.left' | 'chevron.right';
  label: string;
  disabled: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, (pressed || disabled) && styles.dimmed]}>
      <Icon name={icon} size={18} color="accent" />
    </Pressable>
  );
}

/** One photo's page. Each keeps its own search and scroll position. */
function SheetContent({
  jobId,
  item,
  current,
  startSearching,
  choice,
  onChange,
  onSkip,
  onRetry,
  busy,
  online,
}: {
  jobId: number;
  item: ScanItem;
  /** The page on screen; its neighbours are drawn ready for a swipe. */
  current: boolean;
  /** Open straight into a search when there are no candidates. */
  startSearching: boolean;
  choice: BatchChoice;
  onChange(choice: BatchChoice): void;
  onSkip(item: ScanItem): void;
  onRetry(item: ScanItem): void;
  busy: boolean;
  online: boolean;
}) {
  const colors = useColors();
  const candidates = candidatesOf(item);
  const state = itemState(item);
  const [searching, setSearching] = useState(startSearching && candidates.length === 0);
  // Upstream's copy of a photo costs a request: only fetched once it is
  // looked at, not for the neighbours drawn either side.
  const [seen, setSeen] = useState(current);
  if (current && !seen) setSeen(true);
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
    <>
      {searching ? (
        <CardSearchPane
          initial={searchTermFor(item.recognized)}
          onPick={pickFromSearch}
          onCancel={candidates.length > 0 || picked ? () => setSearching(false) : undefined}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.compare}>
            <View style={styles.compareSide}>
              <ScanPhoto jobId={jobId} item={item} remote={seen} />
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
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerBar: { paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.xs },
  title: { flex: 1, alignItems: 'center' },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.4 },
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
});
