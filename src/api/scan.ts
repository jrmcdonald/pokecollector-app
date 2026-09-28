/**
 * Waiting for a scan. Upstream recognizes photos in the background, so the
 * app polls the job until its one item is done or has failed. Every poll
 * counts against the 60-a-minute rate limit, so the gaps grow: 1 s, 2 s,
 * 4 s, then every 8 s, or later when upstream says when it will retry.
 */
import type { PokeCollectorClient } from './client';
import { getScanJob } from './endpoints';
import type { Recognized, ScanItem } from './schemas';

export const POLL_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;
/** Longest the app waits between polls, whatever upstream's retry time says. */
const MAX_DELAY_MS = 30_000;
/** Long enough for a slow model and one upstream retry. */
export const MAX_WAIT_MS = 120_000;

export class ScanCancelled extends Error {
  constructor() {
    super('Scan cancelled.');
    this.name = 'ScanCancelled';
  }
}

export class ScanTimedOut extends Error {
  constructor(readonly jobId: number) {
    super('The scanner is taking too long. The photo is still queued in PokeCollector.');
    this.name = 'ScanTimedOut';
  }
}

export function isFinished(item: Pick<ScanItem, 'status'>): boolean {
  return item.status === 'done' || item.status === 'failed';
}

/** The wait before poll number `attempt` (0-based), honouring a scheduled retry. */
export function nextDelay(attempt: number, item: ScanItem | null, now: number): number {
  const backoff = POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)] ?? 8_000;
  if (item?.status === 'retrying' && item.next_attempt_at) {
    // Upstream sends naive UTC ISO timestamps.
    const at = Date.parse(
      /[zZ]|[+-]\d\d:\d\d$/.test(item.next_attempt_at)
        ? item.next_attempt_at
        : `${item.next_attempt_at}Z`,
    );
    if (Number.isFinite(at)) return Math.min(MAX_DELAY_MS, Math.max(backoff, at - now + 500));
  }
  return backoff;
}

const realSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ScanCancelled());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ScanCancelled());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export async function waitForScan(
  client: PokeCollectorClient,
  jobId: number,
  options: {
    signal?: AbortSignal;
    onProgress?(item: ScanItem): void;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    now?: () => number;
    maxWaitMs?: number;
  } = {},
): Promise<ScanItem> {
  const {
    signal,
    onProgress,
    sleep = realSleep,
    now = Date.now,
    maxWaitMs = MAX_WAIT_MS,
  } = options;
  const started = now();
  let item: ScanItem | null = null;
  for (let attempt = 0; ; attempt += 1) {
    const delay = nextDelay(attempt, item, now());
    if (now() + delay - started > maxWaitMs) throw new ScanTimedOut(jobId);
    await sleep(delay, signal);
    if (signal?.aborted) throw new ScanCancelled();
    const job = await getScanJob(client, jobId);
    item = job.items?.[0] ?? null;
    if (item) {
      onProgress?.(item);
      if (isFinished(item)) return item;
    }
  }
}

/**
 * What to put in Search when no candidate is right: the set code and number
 * when the model read both (upstream search understands "MEP 022"), else the
 * name, in English when the model gave one.
 */
export function searchTermFor(recognized: Recognized | null | undefined): string {
  const code = recognized?.set_code?.trim();
  const number = recognized?.number_local ? String(recognized.number_local).trim() : '';
  if (code && number) return `${code} ${number}`;
  return (recognized?.name_en || recognized?.name || '').trim();
}

/**
 * Upstream answers 400 when the scanner has no API key, and for Gemini its
 * message is in German whatever the language setting, so that case gets the
 * app's own words.
 */
export const MISSING_KEY = /api[ -]?key|schlüssel|konfiguriert|not configured|no scanner/i;
