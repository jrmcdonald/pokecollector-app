/**
 * Batch scanning: a stack of photos sent as one job, reviewed together, and
 * added one card at a time at a pace the rate limit allows.
 *
 * One poll of the job returns every item, so waiting on thirty photos costs
 * the same as waiting on one. Adding is what costs: `resolve-and-add` is one
 * request per card, so the queue sends them one after another, a second
 * apart, and waits out a 429 rather than firing thirty at once.
 */
import {
  ProxyError,
  ApiError,
  AuthError,
  ConflictError,
  NetworkError,
  RateLimitError,
} from './errors';
import { isFinished, parseUpstreamTime, rankCandidates, realSleep, ScanCancelled } from './scan';
import {
  candidatesOf,
  type Condition,
  type ScanItem,
  type ScanJob,
  type ScanMatch,
  type SearchCard,
  type Variant,
} from './schemas';

/** Upstream's limit on photos in one job. */
export const MAX_BATCH_PHOTOS = 50;

/** Every 3 s at first, easing to every 10 s: a batch takes minutes, not seconds. */
export const BATCH_POLL_DELAYS_MS = [3_000, 3_000, 4_000, 5_000, 6_000, 8_000, 10_000] as const;
const MAX_RETRY_WAIT_MS = 30_000;

/** Items upstream is still reading: pending, processing or retrying. */
export function activeCount(job: ScanJob): number {
  if (job.items) return job.items.filter((item) => !isFinished(item)).length;
  return job.active ?? 0;
}

/**
 * How long to wait before polling the job again (poll number `attempt`,
 * from 0), or false once nothing is left to read. When every photo left is
 * waiting on an upstream retry, the next poll waits for that retry.
 */
export function batchPollDelay(attempt: number, job: ScanJob | undefined, now: number) {
  if (!job || activeCount(job) === 0) return false;
  const backoff =
    BATCH_POLL_DELAYS_MS[Math.min(attempt, BATCH_POLL_DELAYS_MS.length - 1)] ?? 10_000;
  const onlyRetrying = (job.retrying ?? 0) > 0 && job.retrying === job.active;
  if (onlyRetrying && job.next_retry_at) {
    const at = parseUpstreamTime(job.next_retry_at);
    if (at !== null) return Math.min(MAX_RETRY_WAIT_MS, Math.max(backoff, at - now + 500));
  }
  return backoff;
}

/**
 * Where one photo is:
 * - `reading`: upstream has not finished with it.
 * - `ready`: read, with candidates to choose from.
 * - `unmatched`: read, but nothing in the catalogue matched.
 * - `failed`: the scanner gave up on it; it can be tried again.
 * - `handled`: added or skipped, here or in the web UI.
 */
export type BatchItemState = 'reading' | 'ready' | 'unmatched' | 'failed' | 'handled';

export function itemState(item: ScanItem): BatchItemState {
  if (item.resolved) return 'handled';
  if (!isFinished(item)) return 'reading';
  if (item.status === 'failed') return 'failed';
  return candidatesOf(item).length > 0 ? 'ready' : 'unmatched';
}

export interface BatchProgress {
  total: number;
  /** Finished reading, whatever the outcome. */
  read: number;
  reading: number;
  ready: number;
  unmatched: number;
  failed: number;
  handled: number;
}

export function batchProgress(job: ScanJob): BatchProgress {
  const progress: BatchProgress = {
    total: 0,
    read: 0,
    reading: 0,
    ready: 0,
    unmatched: 0,
    failed: 0,
    handled: 0,
  };
  for (const item of job.items ?? []) {
    progress.total += 1;
    progress[itemState(item)] += 1;
  }
  progress.read = progress.total - progress.reading;
  return progress;
}

/** The card chosen for a photo: one of the scanner's candidates, or a search result. */
export type BatchPick =
  { kind: 'candidate'; match: ScanMatch } | { kind: 'search'; card: SearchCard };

export interface BatchChoice {
  pick: BatchPick | null;
  variant: Variant;
  condition: Condition;
  quantity: number;
  printing_details: string[];
}

/**
 * What a photo adds unless it is changed: the best candidate (the one whose
 * number matches what was read, else upstream's first), Normal, NM, one copy.
 */
export function defaultChoice(item: ScanItem): BatchChoice {
  const best = rankCandidates(candidatesOf(item), item.recognized)[0];
  return {
    pick: best ? { kind: 'candidate', match: best.match } : null,
    variant: 'Normal',
    condition: 'NM',
    quantity: 1,
    printing_details: [],
  };
}

/**
 * The photos "Add all" would add, in upload order: unhandled, finished, with
 * a card chosen. A search pick can stand in for a photo the scanner failed
 * on; a candidate needs the photo read.
 */
export function addableItems(
  items: readonly ScanItem[],
  choices: Readonly<Record<number, BatchChoice>>,
): ScanItem[] {
  return items.filter((item) => {
    const state = itemState(item);
    if (state === 'handled' || state === 'reading') return false;
    const pick = (choices[item.id] ?? defaultChoice(item)).pick;
    if (!pick) return false;
    return pick.kind === 'search' || state === 'ready';
  });
}

/** A repeat of a request that already landed: upstream refuses it with 409. */
export function isAlreadyHandled(error: unknown): boolean {
  return error instanceof ConflictError && /already been handled/i.test(error.message);
}

export type QueueEvent =
  | { type: 'start'; itemId: number; index: number; total: number }
  | { type: 'added'; itemId: number }
  | { type: 'handled'; itemId: number }
  | { type: 'failed'; itemId: number; message: string }
  | { type: 'waiting'; seconds: number };

export interface QueueResult {
  added: number[];
  /** Already handled upstream when the queue got to them. */
  handled: number[];
  failed: { itemId: number; message: string }[];
  /** Why the queue stopped early, if it did; `remaining` were not tried. */
  stopped: Error | null;
  remaining: number[];
}

export interface QueueOptions {
  signal?: AbortSignal;
  onEvent?(event: QueueEvent): void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  /** The least time between two requests. */
  minGapMs?: number;
  /** How long to wait on a 429 that did not say. */
  defaultRetryAfterS?: number;
  /** 429s in a row on one card before giving up for now. */
  maxRateLimitWaits?: number;
}

/**
 * Errors that would fail every card after this one too: no connection, the
 * service token or login rejected, or cancelled. The queue stops on these
 * and leaves the rest for later, instead of failing each card in turn.
 */
function stopsQueue(error: unknown): boolean {
  return (
    error instanceof NetworkError ||
    error instanceof ProxyError ||
    error instanceof AuthError ||
    error instanceof ScanCancelled
  );
}

/**
 * Adds cards one after another. A 429 waits for as long as upstream says
 * (or 15 s) and tries the same card again; nothing is lost, since a
 * rejected request changed nothing. Upstream makes `resolve-and-add`
 * idempotent, so a card whose request landed before the connection dropped
 * is reported as handled on the next run rather than added twice.
 */
export async function runAddQueue(
  itemIds: readonly number[],
  add: (itemId: number) => Promise<void>,
  options: QueueOptions = {},
): Promise<QueueResult> {
  const {
    signal,
    onEvent,
    sleep = realSleep,
    now = Date.now,
    minGapMs = 1_000,
    defaultRetryAfterS = 15,
    maxRateLimitWaits = 4,
  } = options;
  const result: QueueResult = { added: [], handled: [], failed: [], stopped: null, remaining: [] };
  let lastStart = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < itemIds.length; index += 1) {
    const itemId = itemIds[index] as number;
    let waits = 0;
    for (;;) {
      try {
        if (signal?.aborted) throw new ScanCancelled();
        const gap = lastStart + minGapMs - now();
        if (gap > 0) await sleep(gap, signal);
        lastStart = now();
        onEvent?.({ type: 'start', itemId, index, total: itemIds.length });
        await add(itemId);
        result.added.push(itemId);
        onEvent?.({ type: 'added', itemId });
        break;
      } catch (error) {
        if (error instanceof RateLimitError && waits < maxRateLimitWaits) {
          waits += 1;
          const seconds = error.retryAfter ?? defaultRetryAfterS;
          onEvent?.({ type: 'waiting', seconds });
          try {
            await sleep(seconds * 1000, signal);
          } catch (cancelled) {
            result.stopped = cancelled instanceof Error ? cancelled : new ScanCancelled();
            result.remaining = itemIds.slice(index);
            return result;
          }
          continue;
        }
        if (isAlreadyHandled(error)) {
          result.handled.push(itemId);
          onEvent?.({ type: 'handled', itemId });
          break;
        }
        if (stopsQueue(error) || error instanceof RateLimitError) {
          result.stopped = error as Error;
          result.remaining = itemIds.slice(index);
          return result;
        }
        const message =
          error instanceof ApiError ? error.message : 'Something went wrong adding this card.';
        result.failed.push({ itemId, message });
        onEvent?.({ type: 'failed', itemId, message });
        break;
      }
    }
  }
  return result;
}
