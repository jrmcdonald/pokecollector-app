/**
 * "Add all" for a batch: the chosen card for each photo, added one after
 * another by `runAddQueue`, with progress for the screen and a failure
 * message per photo. Leaving the screen stops it; whatever was not added
 * stays in the job to add later.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { defaultChoice, runAddQueue, type BatchChoice } from '@/api/batch';
import { addToCollection, dismissScanItem, resolveAndAddScan } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { ScanCancelled } from '@/api/scan';
import type { ScanItem } from '@/api/schemas';
import {
  reportFailure,
  succeeded,
  useInvalidateOwnership,
  useKeys,
  useUpdateScanItem,
} from '@/hooks/queries';
import { showToast } from '@/utils/toast';

export interface BatchAddProgress {
  /** Cards finished (added, already handled or failed) this run. */
  done: number;
  total: number;
  /** Seconds the queue is waiting out a 429 for, while it is. */
  waitingS: number | null;
}

export function useBatchAdd(jobId: number) {
  const queryClient = useQueryClient();
  const { getClient, keys } = useKeys();
  const invalidateOwnership = useInvalidateOwnership();
  const updateItem = useUpdateScanItem();
  const [progress, setProgress] = useState<BatchAddProgress | null>(null);
  /** Photos added from this screen, to say "Added" rather than just "Done". */
  const [added, setAdded] = useState<ReadonlySet<number>>(new Set());
  const [failures, setFailures] = useState<Readonly<Record<number, string>>>({});
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Photos whose card, picked from search, is already in the collection but
   * whose dismissal has not gone through. Trying again only dismisses, so the
   * card is not added twice (plain collection adds are not idempotent).
   */
  const inCollection = useRef(new Set<number>());

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    async (items: readonly ScanItem[], choices: Readonly<Record<number, BatchChoice>>) => {
      if (abortRef.current || items.length === 0) return;
      const abort = new AbortController();
      abortRef.current = abort;
      // One client for the whole run, so every card lands in the account the
      // run started in, whatever happens to the active account meanwhile.
      const client = getClient();
      const byId = new Map(items.map((item) => [item.id, item]));
      setProgress({ done: 0, total: items.length, waitingS: null });
      setFailures((old) => {
        const next = { ...old };
        for (const item of items) delete next[item.id];
        return next;
      });

      const addOne = async (itemId: number) => {
        const item = byId.get(itemId);
        if (!item) return;
        const { pick, ...details } = choices[itemId] ?? defaultChoice(item);
        if (!pick) return;
        if (pick.kind === 'candidate') {
          await resolveAndAddScan(client, jobId, itemId, {
            card_id: pick.match.id,
            confirmedCardId: pick.match.tcg_card_id,
            lang: pick.match.lang ?? item.recognized?.language ?? 'en',
            ...details,
          });
          return;
        }
        if (!inCollection.current.has(itemId)) {
          await addToCollection(client, { card_id: pick.card.id, ...details });
          inCollection.current.add(itemId);
        }
        await dismissScanItem(client, jobId, itemId);
        inCollection.current.delete(itemId);
      };

      const finished = (itemId: number) => {
        updateItem(jobId, itemId, (item) => ({ ...item, resolved: true, has_image: false }));
        setProgress((p) => p && { ...p, done: p.done + 1, waitingS: null });
      };

      const result = await runAddQueue(
        items.map((item) => item.id),
        addOne,
        {
          signal: abort.signal,
          onEvent: (event) => {
            if (abort.signal.aborted) return;
            switch (event.type) {
              case 'added':
                finished(event.itemId);
                setAdded((old) => new Set(old).add(event.itemId));
                break;
              case 'handled':
                finished(event.itemId);
                break;
              case 'failed':
                setFailures((old) => ({ ...old, [event.itemId]: event.message }));
                setProgress((p) => p && { ...p, done: p.done + 1 });
                break;
              case 'waiting':
                setProgress((p) => p && { ...p, waitingS: event.seconds });
                break;
              case 'start':
                break;
            }
          },
        },
      );

      abortRef.current = null;
      // Refresh what the new cards change once, not once per card.
      if (result.added.length + result.handled.length > 0) {
        invalidateOwnership();
        queryClient.invalidateQueries({ queryKey: keys.scanJobs });
      }
      if (result.stopped instanceof ScanCancelled) return;
      setProgress(null);
      if (result.added.length > 0) succeeded();
      if (result.stopped) {
        const left = result.remaining.length;
        reportFailure(
          `${left} ${left === 1 ? 'card was' : 'cards were'} not added yet`,
          result.stopped instanceof ApiError
            ? new ApiError(`${result.stopped.message} Add all again to carry on.`)
            : result.stopped,
        );
      } else if (result.failed.length > 0) {
        showToast({
          kind: 'error',
          title: `${result.failed.length} could not be added`,
          message: 'They are marked in the list.',
        });
      }
    },
    [getClient, invalidateOwnership, jobId, keys.scanJobs, queryClient, updateItem],
  );

  return { start, progress, adding: progress !== null, added, failures };
}
