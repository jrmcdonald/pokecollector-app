import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addableItems,
  batchProgress,
  defaultChoice,
  type BatchChoice,
  type BatchProgress,
} from '@/api/batch';
import type { ScanItem } from '@/api/schemas';
import { Button } from '@/components/button';
import { ProgressBar } from '@/components/progress-bar';
import { BatchItemSheet } from '@/components/scan/batch-item-sheet';
import { BatchRow } from '@/components/scan/batch-row';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useDiscardScanJob,
  useDismissScanItem,
  useIsOnline,
  useKeys,
  useRetryScanItem,
  useScanJob,
} from '@/hooks/queries';
import { useBatchAdd, type BatchAddProgress } from '@/hooks/use-batch-add';
import { useOwnerLabel } from '@/hooks/use-owner-label';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { spacing, useColors } from '@/theme';
import { forgetBatchPhotos } from '@/utils/batch-photos';
import { progressLine } from '@/utils/batch-review';

/**
 * A batch's review: every photo in order, with the best candidate chosen,
 * while upstream is still reading the rest. Tap a photo to change its card
 * or how it goes in; "Add all" adds the ready ones one after another.
 */
export default function ScanReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = Number(id);
  const colors = useColors();
  const online = useIsOnline();
  const owner = useOwnerLabel();
  const { cacheId } = useKeys();
  const job = useScanJob(jobId);
  const pull = usePullToRefresh(() => job.refetch());
  const batch = useBatchAdd(jobId);
  const dismiss = useDismissScanItem();
  const retry = useRetryScanItem();
  const discard = useDiscardScanJob();

  const [choices, setChoices] = useState<Record<number, BatchChoice>>({});
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);

  const items = useMemo(
    () => [...(job.data?.items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [job.data?.items],
  );
  const progress = useMemo(() => (job.data ? batchProgress(job.data) : null), [job.data]);
  const addable = useMemo(() => addableItems(items, choices), [items, choices]);
  const choiceFor = (item: ScanItem) => choices[item.id] ?? defaultChoice(item);
  const open = items.find((item) => item.id === openId) ?? null;
  const allDone = !!progress && progress.total > 0 && progress.handled === progress.total;

  // Every photo handled: the phone's copies are no use any more.
  useEffect(() => {
    if (allDone && cacheId) forgetBatchPhotos(cacheId, jobId);
  }, [allDone, cacheId, jobId]);

  const confirmDiscard = () =>
    Alert.alert(
      'Discard this batch?',
      'Photos not added yet are deleted from PokeCollector. Cards already added stay in the collection.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => discard.mutate(jobId, { onSuccess: () => router.back() }),
        },
      ],
    );

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          title: 'Review scans',
          unstable_headerRightItems: () =>
            job.data && !allDone
              ? [
                  {
                    type: 'button',
                    label: 'Discard',
                    accessibilityLabel: 'Discard this batch',
                    icon: { type: 'sfSymbol', name: 'trash' },
                    onPress: confirmDiscard,
                  },
                ]
              : [],
        }}
      />
      {job.data && progress ? (
        <SafeAreaView edges={['bottom']} style={styles.fill}>
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            contentInsetAdjustmentBehavior="automatic"
            refreshControl={
              <RefreshControl
                refreshing={pull.refreshing}
                onRefresh={pull.onRefresh}
                tintColor={colors.textSecondary}
              />
            }
            ListHeaderComponent={<Progress progress={progress} />}
            renderItem={({ item }) => (
              <BatchRow
                jobId={jobId}
                item={item}
                choice={choiceFor(item)}
                outcome={
                  batch.added.has(item.id) ? 'added' : skipped.has(item.id) ? 'skipped' : undefined
                }
                failure={batch.failures[item.id]}
                // The queue has taken its copy of the choices; changes now
                // would not reach it.
                onPress={() => !batch.adding && setOpenId(item.id)}
              />
            )}
            ListEmptyComponent={
              <EmptyState title="No photos" message="This batch has nothing in it." />
            }
          />
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {allDone ? (
              <>
                <ThemedText variant="label" style={styles.centred}>
                  Every photo is added or skipped.
                </ThemedText>
                <Button title="Scan more" onPress={() => router.navigate('/scan')} />
              </>
            ) : (
              <>
                <AddStatus progress={batch.progress} online={online} />
                <Button
                  title={
                    addable.length === 0
                      ? 'Nothing ready to add'
                      : `Add ${addable.length} to ${owner ?? 'collection'}`
                  }
                  busy={batch.adding}
                  disabled={addable.length === 0 || !online}
                  onPress={() => batch.start(addable, choices)}
                />
              </>
            )}
          </View>
        </SafeAreaView>
      ) : job.error ? (
        <ErrorState error={job.error} onRetry={() => job.refetch()} />
      ) : (
        <ListSkeleton rows={6} />
      )}

      <BatchItemSheet
        jobId={jobId}
        item={open}
        choice={open ? choiceFor(open) : null}
        onChange={(choice) => open && setChoices((old) => ({ ...old, [open.id]: choice }))}
        onClose={() => setOpenId(null)}
        busy={dismiss.isPending || retry.isPending}
        online={online}
        onSkip={(item) => {
          setOpenId(null);
          dismiss.mutate(
            { jobId, itemId: item.id },
            { onSuccess: () => setSkipped((old) => new Set(old).add(item.id)) },
          );
        }}
        onRetry={(item) => {
          setOpenId(null);
          // New candidates are coming; the old choice would not be one of them.
          setChoices(({ [item.id]: _dropped, ...rest }) => rest);
          retry.mutate({ jobId, itemId: item.id });
        }}
      />
    </ThemedView>
  );
}

/** How far upstream has got, and what is left to do. */
function Progress({ progress }: { progress: BatchProgress }) {
  const line = progressLine(progress);
  return (
    <View style={styles.progress}>
      <ThemedText variant="figureSmall" color="textSecondary" accessibilityLiveRegion="polite">
        {line}
      </ThemedText>
      {progress.reading > 0 ? (
        <ProgressBar value={progress.read / Math.max(1, progress.total)} decorative />
      ) : null}
    </View>
  );
}

/** The line over "Add all" while it runs: how far it is, or why it is waiting. */
function AddStatus({ progress, online }: { progress: BatchAddProgress | null; online: boolean }) {
  const text = !online
    ? 'Offline: adding needs a connection'
    : progress
      ? progress.waitingS
        ? `The server asked for a pause; carrying on in ${progress.waitingS} s…`
        : `Adding ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
      : null;
  if (!text) return null;
  return (
    <ThemedText
      variant="caption"
      color="textSecondary"
      style={styles.centred}
      accessibilityLiveRegion="polite">
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  progress: { padding: spacing.md, gap: spacing.sm },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  centred: { textAlign: 'center' },
});
