import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  bulkUnlinkProducts,
  releaseAssignments,
  releasePlan,
  removalConflict,
  unlinkPlan,
  type BlockedEntry,
} from '@/api/removal';
import { reportFailure, succeeded, useInvalidateOwnership, useKeys } from '@/hooks/queries';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { minTapTarget, radius, spacing, useColors } from '@/theme';
import {
  closeRemovalConflict,
  updateRemovalConflict,
  usePendingRemoval,
} from '@/utils/removal-conflict';
import { showToast } from '@/utils/toast';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const copies = (n: number) => `${n} ${n === 1 ? 'copy' : 'copies'}`;

const ask = (title: string, message: string, action: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );

/**
 * A removal upstream refused (409): which cards are still in a binder, a
 * Real Deck or a sealed product, and upstream's own ways to free them, each
 * behind its own confirmation, then the removal again. Rendered once, in the
 * root layout; `openRemovalConflict` shows it. Upstream's web UI for #456
 * (`BulkRemovalToolbar`) is the model for the steps and their wording.
 */
export function RemovalConflictSheet() {
  const pending = usePendingRemoval();
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const { getClient } = useKeys();
  const invalidate = useInvalidateOwnership();
  const [busy, setBusy] = useState(false);
  const conflict = pending?.conflict ?? null;
  // What has been freed, for this answer from upstream only: a new answer
  // is a new list to confirm from the start.
  const [done, setDone] = useState<{ for: unknown; released: boolean; unlinked: boolean }>({
    for: null,
    released: false,
    unlinked: false,
  });
  const released = done.for === conflict && done.released;
  const unlinked = done.for === conflict && done.unlinked;
  const setReleased = () => setDone({ for: conflict, released: true, unlinked });
  const setUnlinked = () => setDone({ for: conflict, released, unlinked: true });

  if (!pending || !conflict) return null;

  const release = releasePlan(conflict);
  const unlink = unlinkPlan(conflict);
  const assignmentsLeft = !!release && !released;
  const productsLeft = conflict.conflicts.some((c) => c.products.length > 0) && !unlinked;
  const changed = conflict.code === 'collection_assignments_changed';

  async function run(step: () => Promise<unknown>, done: () => void, failure: string) {
    setBusy(true);
    try {
      await step();
      succeeded();
      done();
    } catch (error) {
      const next = removalConflict(error);
      if (next) updateRemovalConflict(next);
      else reportFailure(failure, error);
    } finally {
      setBusy(false);
      await invalidate();
    }
  }

  async function releaseAll() {
    if (!release) return;
    const total = release.assignments.reduce((sum, a) => sum + a.quantity, 0);
    const ok = await ask(
      'Take these copies out of their binders and decks?',
      `${copies(total)} come out of ${release.assignments.length === 1 ? 'one binder or deck' : `${release.assignments.length} binder and deck places`}. They stay in your collection: nothing is removed yet.`,
      'Take out',
    );
    if (ok) {
      await run(
        () => releaseAssignments(getClient(), release),
        setReleased,
        'Could not take them out',
      );
    }
  }

  async function unlinkAll() {
    if (!unlink?.canExecute) return;
    const total = unlink.body.links.reduce((sum, l) => sum + l.active_quantity, 0);
    const ok = await ask(
      'Unlink these copies from their products?',
      `${copies(total)} stop counting towards ${unlink.body.links.length === 1 ? 'their product' : `${unlink.body.links.length} product links`}. The products and your copies stay, and no sale is recorded.`,
      'Unlink',
    );
    if (ok) {
      await run(
        () => bulkUnlinkProducts(getClient(), unlink.body),
        setUnlinked,
        'Could not unlink them',
      );
    }
  }

  async function removeAgain() {
    if (!pending) return;
    const { retry, onRemoved } = pending;
    await run(
      retry,
      () => {
        closeRemovalConflict();
        showToast({ kind: 'success', title: 'Removed from your collection' });
        onRemoved?.();
      },
      'Could not remove them',
    );
  }

  return (
    <Modal
      visible
      animationType={reduceMotion ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={() => !busy && closeRemovalConflict()}>
      <ThemedView style={styles.fill}>
        <SafeAreaView edges={['bottom']} style={styles.fill}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <ThemedText variant="heading" accessibilityRole="header" style={styles.fill}>
              {conflict.conflicts.some((c) => c.assignments.length)
                ? 'Still in binders or decks'
                : 'Linked to a sealed product'}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              disabled={busy}
              onPress={closeRemovalConflict}
              style={styles.close}>
              <ThemedText variant="label" style={{ color: colors.accent }}>
                Close
              </ThemedText>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText variant="body">{conflict.message}</ThemedText>
            {changed ? (
              <ThemedText variant="body" accessibilityRole="alert">
                These changed since you looked. Check the list below and confirm again.
              </ThemedText>
            ) : null}
            {conflict.conflicts.map((entry) => (
              <Blocked key={entry.item_id} entry={entry} released={released} unlinked={unlinked} />
            ))}
          </ScrollView>
          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            {released ? (
              <ThemedText variant="caption" color="textSecondary" accessibilityRole="alert">
                Taken out of binders and decks. Nothing has been removed from your collection yet.
              </ThemedText>
            ) : null}
            {unlinked ? (
              <ThemedText variant="caption" color="textSecondary" accessibilityRole="alert">
                Unlinked from products. Nothing has been removed from your collection yet.
              </ThemedText>
            ) : null}
            {assignmentsLeft ? (
              <Button
                title="Take out of binders and decks"
                variant="secondary"
                busy={busy}
                onPress={releaseAll}
              />
            ) : null}
            {productsLeft && unlink?.canExecute ? (
              <Button
                title="Unlink from products"
                variant="secondary"
                busy={busy}
                onPress={unlinkAll}
              />
            ) : null}
            {productsLeft && !unlink?.canExecute ? (
              <ThemedText variant="caption" color="textSecondary">
                A product link with sale or trade history can’t be undone here. Open the product to
                record what happened to that copy.
              </ThemedText>
            ) : null}
            <Button
              title="Remove from collection"
              variant="destructive"
              busy={busy}
              disabled={assignmentsLeft || productsLeft}
              accessibilityHint={
                assignmentsLeft || productsLeft
                  ? 'Free the copies above first'
                  : 'Removes the cards you chose, every copy'
              }
              onPress={removeAgain}
            />
          </View>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

/** One blocked collection entry: where its copies are held. */
function Blocked({
  entry,
  released,
  unlinked,
}: {
  entry: BlockedEntry;
  released: boolean;
  unlinked: boolean;
}) {
  const colors = useColors();
  const what = [entry.variant, entry.condition, entry.quantity ? copies(entry.quantity) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <View
      accessible
      style={[styles.entry, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <ThemedText variant="label">
        {entry.name ?? entry.card_id ?? `Entry ${entry.item_id}`}
      </ThemedText>
      {what ? (
        <ThemedText variant="caption" color="textSecondary">
          {what}
        </ThemedText>
      ) : null}
      {released
        ? null
        : entry.assignments.map((a) => (
            <ThemedText key={a.assignment_id} variant="caption">
              {a.list_type === 'physical_deck' ? 'In the Real Deck' : 'In the binder'}{' '}
              {a.list_name ?? `#${a.list_id}`} · {copies(a.quantity)}
            </ThemedText>
          ))}
      {unlinked
        ? null
        : entry.products.map((p) => (
            <ThemedText key={p.product_card_id} variant="caption">
              From {p.product_name ?? `product #${p.product_id}`} · {copies(p.active_quantity)}
              {p.can_unlink === false ? ' · has sale or trade history' : ''}
            </ThemedText>
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: {
    minHeight: minTapTarget,
    minWidth: minTapTarget,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  content: { padding: spacing.md, gap: spacing.md },
  entry: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  actions: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
