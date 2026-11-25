/**
 * Safe retries for the writes that add something (upstream 1.58.0,
 * Git-Romer/pokecollector#474, `services/idempotency.py`).
 *
 * `POST /api/collection/`, `POST /api/wishlist/` and
 * `POST /api/cards/recognize/jobs` accept an `Idempotency-Key`. Upstream
 * stores a successful answer under it for 14 days, per account, and answers
 * a repeat of the same request with that stored answer (header
 * `Idempotent-Replayed: true`) instead of adding again. So a write whose
 * answer was lost (a timeout, a dropped connection, a 5xx from the tunnel)
 * can be sent again without adding a card twice.
 *
 * One key is one user action: minted when the action starts, reused by every
 * retry of it, never sent with a different body (upstream refuses that with
 * 422 `idempotency_key_reused`).
 *
 * Servers before 1.58.0 ignore both headers, so they are sent without
 * asking. Retrying is another matter: such a server would add again. So a
 * write is only sent a second time once `GET /api/health` has said
 * `features: ["idempotency-v1"]`, asked only after a write has failed and
 * remembered for the session, as upstream's own offline outbox does. See
 * DECISIONS.md, "Safe retries".
 */
import { ApiError, ConflictError, NetworkError, RateLimitError, ServerError } from './errors';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const EXPECTED_USER_HEADER = 'X-Expected-User-Id';
export const REPLAYED_HEADER = 'Idempotent-Replayed';

/** Upstream's `_KEY_PATTERN`: 16–64 of A–Z, a–z, 0–9, `_` and `-`. */
export const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 32 random characters from upstream's alphabet: one per user action. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(32);
  const crypto = (globalThis as { crypto?: { getRandomValues?(a: Uint8Array): Uint8Array } })
    .crypto;
  if (crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  // `% 62` leaves a slight bias towards the first letters: irrelevant for a
  // key that only has to differ from this account's other keys.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** `detail.code` of an upstream error, when it sent an object. */
export function errorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const code = (error.detail as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Retries after the first try: four sends in all. */
export const MAX_RETRIES = 3;
/** Waits after a lost answer or a 5xx, in seconds. */
const BACKOFF_S = [1, 2, 4] as const;
/** Upstream's own Retry-After for `idempotency_in_progress`. */
const IN_PROGRESS_S = 2;
/** A 429 with no Retry-After waits this long. */
const RATE_LIMIT_DEFAULT_S = 5;
/** And no longer than this, whatever it says: someone is waiting on the button. */
const RATE_LIMIT_MAX_S = 30;

/**
 * How long to wait before sending the same request again, or null when the
 * error is an answer to take as it is. `retry` counts from 0.
 */
export function retryDelayMs(error: unknown, retry: number): number | null {
  if (retry >= MAX_RETRIES) return null;
  if (error instanceof RateLimitError) {
    return Math.min(error.retryAfter ?? RATE_LIMIT_DEFAULT_S, RATE_LIMIT_MAX_S) * 1000;
  }
  if (error instanceof ConflictError) {
    // The first send is still running upstream; its answer will be replayed.
    return errorCode(error) === 'idempotency_in_progress' ? IN_PROGRESS_S * 1000 : null;
  }
  if (error instanceof NetworkError || error instanceof ServerError) {
    return (BACKOFF_S[retry] ?? 4) * 1000;
  }
  return null;
}

/** The capability upstream's `GET /api/health` lists when it honours keys. */
export const IDEMPOTENCY_FEATURE = 'idempotency-v1';
