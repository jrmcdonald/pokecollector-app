/**
 * The scan flow as a small state machine: capture → upload → wait for
 * upstream to recognize the card → choose a candidate → add it, then straight
 * back to the camera with a running tally.
 */
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createScanJob, deleteScanJob, retryScanItem } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { MISSING_KEY, ScanCancelled, ScanTimedOut, waitForScan } from '@/api/scan';
import { candidatesOf, type Recognized, type ScanItem, type ScanMatch } from '@/api/schemas';
import { useSession } from '@/session/session';
import type { Size } from '@/utils/crop';
import { prepareScanPhoto } from '@/utils/scan-photo';

export type ScanState =
  | { step: 'camera' }
  | { step: 'uploading' }
  | { step: 'waiting'; jobId: number; status: string | null }
  | {
      step: 'results';
      jobId: number;
      itemId: number;
      candidates: ScanMatch[];
      recognized: Recognized | null;
    }
  | {
      step: 'failed';
      message: string;
      jobId: number | null;
      itemId: number | null;
      /** Upstream can try this photo again (it failed, rather than timing out). */
      canRetry: boolean;
      recognized: Recognized | null;
    };

export function useScanFlow() {
  const { getClient } = useSession();
  const [state, setState] = useState<ScanState>({ step: 'camera' });
  const abortRef = useRef<AbortController | null>(null);
  /** Bumped by reset, so work started before a cancel cannot resume after it. */
  const runRef = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  const settle = useCallback((jobId: number, item: ScanItem) => {
    const candidates = candidatesOf(item);
    if (item.status === 'done' && candidates.length > 0) {
      setState({
        step: 'results',
        jobId,
        itemId: item.id,
        candidates,
        recognized: item.recognized ?? null,
      });
    } else {
      setState({
        step: 'failed',
        jobId,
        itemId: item.id,
        canRetry: item.status === 'failed',
        recognized: item.recognized ?? null,
        message:
          item.error ||
          (item.status === 'done'
            ? 'The scanner read the card but found no match in the catalogue.'
            : 'The scanner could not read this card.'),
      });
    }
  }, []);

  const wait = useCallback(
    async (jobId: number) => {
      const run = runRef.current;
      const abort = new AbortController();
      abortRef.current = abort;
      setState({ step: 'waiting', jobId, status: null });
      try {
        const item = await waitForScan(getClient(), jobId, {
          signal: abort.signal,
          onProgress: (i) => {
            if (run === runRef.current) setState({ step: 'waiting', jobId, status: i.status });
          },
        });
        if (run === runRef.current) settle(jobId, item);
      } catch (error) {
        if (error instanceof ScanCancelled || run !== runRef.current) return;
        setState({
          step: 'failed',
          jobId,
          itemId: null,
          canRetry: false,
          recognized: null,
          message:
            error instanceof ScanTimedOut || error instanceof ApiError
              ? error.message
              : 'Something went wrong while waiting for the scanner.',
        });
      }
    },
    [getClient, settle],
  );

  /**
   * Scans one photo: from the camera, with the view it was taken in so it is
   * cropped to the guide, or from the library, with no view.
   */
  const capture = useCallback(
    async (uri: string, view: Size | null) => {
      const run = runRef.current;
      setState({ step: 'uploading' });
      let jobId: number;
      try {
        const file = await prepareScanPhoto(uri, view);
        try {
          jobId = (await createScanJob(getClient(), [file])).id;
        } finally {
          // Both copies are in the cache directory; neither is needed now.
          for (const copy of [file.uri, uri]) {
            try {
              new File(copy).delete();
            } catch {
              // Best effort: iOS clears the cache directory itself.
            }
          }
        }
      } catch (error) {
        if (run !== runRef.current) return;
        setState({
          step: 'failed',
          jobId: null,
          itemId: null,
          canRetry: false,
          recognized: null,
          message: uploadMessage(error),
        });
        return;
      }
      if (run !== runRef.current) {
        // Cancelled while the photo was uploading: drop the job it made.
        deleteScanJob(getClient(), jobId).catch(() => undefined);
        return;
      }
      await wait(jobId);
    },
    [getClient, wait],
  );

  /** Back to the camera, dropping the job (and its photo) upstream. */
  const reset = useCallback(
    (options: { keepJob?: boolean } = {}) => {
      runRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      if (!options.keepJob && 'jobId' in state && state.jobId !== null) {
        deleteScanJob(getClient(), state.jobId).catch(() => undefined);
      }
      setState({ step: 'camera' });
    },
    [getClient, state],
  );

  const retry = useCallback(async () => {
    if (state.step !== 'failed' || state.jobId === null || state.itemId === null) return;
    const { jobId, itemId } = state;
    try {
      await retryScanItem(getClient(), jobId, itemId);
    } catch (error) {
      setState({ ...state, canRetry: false, message: uploadMessage(error) });
      return;
    }
    await wait(jobId);
  }, [getClient, state, wait]);

  return { state, capture, reset, retry };
}

function uploadMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400 && MISSING_KEY.test(error.message)) {
      return 'The scanner has no API key yet. Add one in the PokeCollector web UI under Settings → Scanner, then take the photo again.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'The photo could not be prepared.';
}
