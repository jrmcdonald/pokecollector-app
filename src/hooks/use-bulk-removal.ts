/**
 * Removing the cards chosen on Collection, a binder or a deck in one atomic
 * request (upstream 1.57.0, #456), after a confirmation. If upstream refuses
 * because a copy is still in a binder, a Real Deck or a product, the
 * conflict sheet takes over: it shows what blocks the removal and offers
 * upstream's own fixes, each confirmed, then removes again.
 */
import { useState } from 'react';
import { Alert } from 'react-native';

import {
  bulkDeleteBinderEntries,
  bulkDeleteCollection,
  bulkDeleteDeckEntries,
  removalConflict,
} from '@/api/removal';
import { openRemovalConflict } from '@/utils/removal-conflict';
import { showToast } from '@/utils/toast';

import { reportFailure, succeeded, useInvalidateOwnership, useKeys } from './queries';
import { useMarkFeatureMissing, useServerFeature } from './use-server-feature';

export type RemovalScope =
  { kind: 'collection' } | { kind: 'binder'; id: number } | { kind: 'deck'; id: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Upstream's wording, made shorter for an iOS alert. */
export function confirmation(scope: RemovalScope, entries: number, copies: number) {
  const what =
    entries === copies
      ? plural(entries, 'card')
      : `${plural(entries, 'entry', 'entries')}, ${plural(copies, 'copy', 'copies')} in all,`;
  switch (scope.kind) {
    case 'collection':
      return {
        title: 'Remove from your collection?',
        message: `${what} will be removed. Every copy in each goes. This can’t be undone.`,
      };
    case 'binder':
      return {
        title: 'Take out of this binder?',
        message: `${what} will come out of this binder. They stay in your collection.`,
      };
    case 'deck':
      return {
        title: 'Take out of this deck?',
        message: `${what} will come out of this deck. Your collection doesn’t change.`,
      };
  }
}

const ask = (title: string, message: string, action: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );

/** Whether multi-select can be offered: hidden for a day after a 404. */
export const useBulkRemovalAvailable = () => useServerFeature('bulk-removal');

export function useBulkRemoval(scope: RemovalScope) {
  const { getClient } = useKeys();
  const invalidate = useInvalidateOwnership();
  const markMissing = useMarkFeatureMissing('bulk-removal');
  const [busy, setBusy] = useState(false);

  const send = (ids: readonly number[]) => {
    const client = getClient();
    switch (scope.kind) {
      case 'collection':
        return bulkDeleteCollection(client, ids);
      case 'binder':
        return bulkDeleteBinderEntries(client, scope.id, ids);
      case 'deck':
        return bulkDeleteDeckEntries(client, scope.id, ids);
    }
  };

  /** Asks, removes, and reports. `onRemoved` once they are gone. */
  async function remove(ids: readonly number[], copies: number, onRemoved: () => void) {
    if (!ids.length || busy) return;
    const { title, message } = confirmation(scope, ids.length, copies);
    if (!(await ask(title, message, 'Remove'))) return;
    setBusy(true);
    try {
      await send(ids);
      succeeded();
      showToast({ kind: 'success', title: `${plural(ids.length, 'card')} removed` });
      onRemoved();
    } catch (error) {
      const conflict = removalConflict(error);
      if (conflict) {
        openRemovalConflict({ conflict, retry: () => send(ids), onRemoved });
      } else if (markMissing(error)) {
        Alert.alert(
          'Not on this server yet',
          'Removing several cards at once needs PokeCollector 1.57.0 or later on the server.',
        );
      } else {
        reportFailure('Could not remove them', error);
      }
    } finally {
      setBusy(false);
      await invalidate();
    }
  }

  return { busy, remove };
}
