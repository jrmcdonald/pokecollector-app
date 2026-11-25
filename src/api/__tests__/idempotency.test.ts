/**
 * Safe retries of the three adding writes (upstream 1.58.0, #474), against a
 * fake that behaves as upstream's `services/idempotency.py` and
 * `tests/test_idempotency.py` describe: a successful answer is stored under
 * the key, per account, and a repeat with the same body is answered from it
 * with `Idempotent-Replayed: true`; the same key with another body is 422
 * `idempotency_key_reused`; a key still being processed is 409
 * `idempotency_in_progress` with `Retry-After: 2`; and `X-Expected-User-Id`
 * naming another account is 409 `wrong_account`.
 */
import { PokeCollectorClient } from '../client';
import { addToCollection, addToWishlist, createScanJob, getMe } from '../endpoints';
import { ConflictError, NetworkError, ServerError, ValidationError } from '../errors';
import { errorCode, KEY_PATTERN, newIdempotencyKey, retryDelayMs } from '../idempotency';
import { CREDENTIALS, fakeFetch, loginOk, type Call } from './fake-server';

const ITEM = { card_id: 'sv1-025_en', quantity: 1, variant: 'Normal', condition: 'NM' } as const;
const ADDED = {
  id: 7,
  card_id: 'sv1-025_en',
  quantity: 1,
  variant: 'Normal',
  condition: 'NM',
};

type Mode = 'honours' | 'legacy';

/**
 * An upstream that adds a card per POST it lets through, and on `honours`
 * keeps each key's answer. `fail` decides, per POST, what goes wrong first.
 */
function upstream(
  options: {
    mode?: Mode;
    fail?: (n: number, call: Call) => 'lost' | 'lost-after-write' | 503 | 429 | 'busy' | null;
    health?: (n: number) => 'ok' | 'down' | 404;
  } = {},
) {
  const { mode = 'honours', fail = () => null, health = () => 'ok' } = options;
  const stored = new Map<string, { body: string; answer: unknown }>();
  let adds = 0;
  let posts = 0;
  let healthChecks = 0;
  const { fetch, calls } = fakeFetch((call) => {
    if (call.url.endsWith('/api/auth/login')) return loginOk('jwt');
    if (call.url.endsWith('/api/auth/me')) {
      return { status: 200, body: { id: 1, username: 'ash', role: 'user' } };
    }
    if (call.url.endsWith('/api/health')) {
      healthChecks += 1;
      const state = health(healthChecks);
      if (state === 'down') throw new Error('offline');
      if (state === 404) return { status: 404, body: { detail: 'Not Found' } };
      return {
        status: 200,
        body: {
          status: 'ok',
          version: mode === 'honours' ? '1.59.0' : '1.57.9',
          ...(mode === 'honours' ? { api_level: 1, features: ['idempotency-v1'] } : {}),
        },
      };
    }
    posts += 1;
    const key = mode === 'honours' ? call.headers['Idempotency-Key'] : undefined;
    const expected = call.headers['X-Expected-User-Id'];
    if (mode === 'honours' && expected !== undefined && expected !== '1') {
      return {
        status: 409,
        body: {
          detail: {
            code: 'wrong_account',
            message: 'This request was queued for a different account.',
          },
        },
      };
    }
    const body = typeof call.body === 'string' ? call.body : 'form';
    const previous = key ? stored.get(key) : undefined;
    if (previous) {
      if (previous.body !== body) {
        return {
          status: 422,
          body: {
            detail: {
              code: 'idempotency_key_reused',
              message: 'This Idempotency-Key was already used for a different request.',
            },
          },
        };
      }
      return {
        status: 200,
        body: previous.answer,
        headers: { 'idempotent-replayed': 'true' },
      };
    }
    const failure = fail(posts, call);
    if (failure === 'lost') throw new Error('The network connection was lost.');
    if (failure === 503) return { status: 503, body: { detail: 'Service Unavailable' } };
    if (failure === 429) {
      return {
        status: 429,
        body: { error: 'Rate limit exceeded: 60 per 1 minute' },
        headers: { 'retry-after': '12' },
      };
    }
    if (failure === 'busy') {
      return {
        status: 409,
        body: {
          detail: {
            code: 'idempotency_in_progress',
            message: 'A request with this key is still being processed.',
          },
        },
        headers: { 'retry-after': '2' },
      };
    }
    adds += 1;
    const answer = call.url.endsWith('/recognize/jobs')
      ? { id: 12, status: 'pending', total: 1, items: [] }
      : { ...ADDED, quantity: adds };
    if (key) stored.set(key, { body, answer });
    // The write landed, then the answer was lost on the way back.
    if (failure === 'lost-after-write') throw new Error('The request timed out.');
    return { status: 200, body: answer };
  });
  const sleeps: number[] = [];
  const client = new PokeCollectorClient(CREDENTIALS, fetch, {
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  const posted = () => calls.filter((c) => c.method === 'POST' && !c.url.endsWith('/login'));
  return {
    client,
    calls,
    sleeps,
    posted,
    adds: () => adds,
    healthChecks: () => healthChecks,
  };
}

describe('keys', () => {
  it('are 32 characters of the alphabet upstream accepts, and differ', () => {
    const keys = new Set(Array.from({ length: 200 }, newIdempotencyKey));
    expect(keys.size).toBe(200);
    for (const key of keys) expect(key).toMatch(KEY_PATTERN);
    expect(newIdempotencyKey()).toHaveLength(32);
  });

  it('are refused by the client when malformed, before anything is sent', async () => {
    const server = upstream();
    await expect(addToCollection(server.client, ITEM, 'short')).rejects.toThrow(
      'Not a valid Idempotency-Key',
    );
    expect(server.calls).toHaveLength(0);
  });
});

describe('the headers', () => {
  it('carry a key on each adding write, and the account once it is known', async () => {
    const server = upstream();
    await addToCollection(server.client, ITEM);
    await addToWishlist(server.client, 'sv1-025_en');
    await createScanJob(server.client, [new Blob(['jpeg'])]);
    const [collection, wishlist, scan] = server.posted();
    for (const call of [collection, wishlist, scan]) {
      expect(call?.headers['Idempotency-Key']).toMatch(KEY_PATTERN);
      // The login said whose account this is.
      expect(call?.headers['X-Expected-User-Id']).toBe('1');
    }
    expect(collection?.url).toBe('https://pc.example.com/api/collection/');
    expect(wishlist?.url).toBe('https://pc.example.com/api/wishlist/');
    expect(scan?.url).toBe('https://pc.example.com/api/cards/recognize/jobs');
    // One action, one key: three actions, three keys.
    expect(
      new Set([collection, wishlist, scan].map((c) => c?.headers['Idempotency-Key'])).size,
    ).toBe(3);
  });

  it('learn the account from /api/auth/me when the token came from elsewhere', async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.url.endsWith('/api/auth/me')
        ? { status: 200, body: { id: 42, username: 'ash', role: 'user' } }
        : { status: 200, body: ADDED },
    );
    const client = new PokeCollectorClient(CREDENTIALS, fetch, { token: 'from-the-test' });
    await addToCollection(client, ITEM);
    expect(calls[0]?.headers['X-Expected-User-Id']).toBeUndefined();
    await getMe(client);
    await addToCollection(client, ITEM);
    expect(calls[2]?.headers['X-Expected-User-Id']).toBe('42');
  });

  it('are not sent with other writes', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: ADDED }));
    const client = new PokeCollectorClient(CREDENTIALS, fetch, { token: 't' });
    await client.request('/api/collection/7', { method: 'PUT', json: { quantity: 2 } });
    expect(calls[0]?.headers['Idempotency-Key']).toBeUndefined();
    expect(calls[0]?.headers['X-Expected-User-Id']).toBeUndefined();
  });
});

describe('retrying with the same key', () => {
  it('adds once when the answer was lost after the write landed, and takes the replay', async () => {
    const server = upstream({ fail: (n) => (n === 1 ? 'lost-after-write' : null) });
    const added = await addToCollection(server.client, ITEM);
    expect(added).toMatchObject({ id: 7, quantity: 1 });
    expect(server.adds()).toBe(1);
    const [first, second] = server.posted();
    expect(second?.headers['Idempotency-Key']).toBe(first?.headers['Idempotency-Key']);
    expect(second?.body).toBe(first?.body);
    expect(server.sleeps).toEqual([1000]);
  });

  it('sends again after a dropped connection, a 5xx and a 429, waiting as told', async () => {
    const failures = ['lost', 503, 429] as const;
    const server = upstream({ fail: (n) => failures[n - 1] ?? null });
    await addToWishlist(server.client, 'sv1-025_en');
    expect(server.adds()).toBe(1);
    expect(new Set(server.posted().map((c) => c.headers['Idempotency-Key'])).size).toBe(1);
    // 1 s, then 2 s, then the 429's own Retry-After.
    expect(server.sleeps).toEqual([1000, 2000, 12_000]);
  });

  it('waits out "still in progress" and takes the stored answer', async () => {
    const server = upstream({ fail: (n) => (n === 1 ? 'busy' : null) });
    await addToCollection(server.client, ITEM);
    expect(server.sleeps).toEqual([2000]);
    expect(server.adds()).toBe(1);
  });

  it('resends the same photos as the same scan job', async () => {
    const server = upstream({ fail: (n) => (n === 1 ? 'lost-after-write' : null) });
    await createScanJob(server.client, [new Blob(['jpeg'])]);
    const [first, second] = server.posted();
    expect(second?.body).toBe(first?.body);
    expect(second?.headers['Idempotency-Key']).toBe(first?.headers['Idempotency-Key']);
    expect(server.adds()).toBe(1);
  });

  it('gives up after three retries', async () => {
    const server = upstream({ fail: () => 503 });
    await expect(addToCollection(server.client, ITEM)).rejects.toBeInstanceOf(ServerError);
    expect(server.posted()).toHaveLength(4);
    expect(server.sleeps).toEqual([1000, 2000, 4000]);
  });

  it('asks whether the server honours keys once, and only after a failure', async () => {
    const server = upstream({ fail: (n) => (n === 1 || n === 3 ? 503 : null) });
    await addToCollection(server.client, ITEM);
    expect(server.healthChecks()).toBe(1);
    await addToCollection(server.client, ITEM);
    await addToCollection(server.client, ITEM);
    expect(server.healthChecks()).toBe(1);
  });

  it('waits, without resending, while it cannot yet tell', async () => {
    const server = upstream({
      fail: (n) => (n === 1 ? 'lost' : null),
      health: (n) => (n === 1 ? 'down' : 'ok'),
    });
    await addToCollection(server.client, ITEM);
    expect(server.posted()).toHaveLength(2);
    expect(server.sleeps).toEqual([1000, 2000]);
  });
});

describe('on a server before 1.58.0', () => {
  it('sends a write once, since a repeat would add again', async () => {
    const server = upstream({ mode: 'legacy', fail: (n) => (n === 1 ? 'lost-after-write' : null) });
    await expect(addToCollection(server.client, ITEM)).rejects.toBeInstanceOf(NetworkError);
    expect(server.posted()).toHaveLength(1);
    expect(server.adds()).toBe(1);
  });

  it('reads a health check without the route as no', async () => {
    const server = upstream({ mode: 'legacy', fail: () => 503, health: () => 404 });
    await expect(addToCollection(server.client, ITEM)).rejects.toBeInstanceOf(ServerError);
    expect(server.posted()).toHaveLength(1);
    // And remembers it.
    await expect(addToCollection(server.client, ITEM)).rejects.toBeInstanceOf(ServerError);
    expect(server.healthChecks()).toBe(1);
  });

  it('still adds normally: the headers are ignored', async () => {
    const server = upstream({ mode: 'legacy' });
    await expect(addToCollection(server.client, ITEM)).resolves.toMatchObject({ id: 7 });
  });
});

describe("upstream's refusals", () => {
  it('says plainly when the write was for another account, and does not retry', async () => {
    const server = upstream();
    await getMe(server.client);
    server.client.rememberUser(2);
    const error = await addToCollection(server.client, ITEM).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(errorCode(error)).toBe('wrong_account');
    expect((error as Error).message).toBe(
      'This was sent for a different account than the one signed in, so nothing was changed.',
    );
    expect(server.posted()).toHaveLength(1);
  });

  it('takes a reused key as the answer, never retrying it', async () => {
    const server = upstream();
    const key = newIdempotencyKey();
    await addToCollection(server.client, ITEM, key);
    const error = await addToCollection(server.client, { ...ITEM, quantity: 2 }, key).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(errorCode(error)).toBe('idempotency_key_reused');
    expect(server.posted()).toHaveLength(2);
  });

  it('retries only what may have been lost', () => {
    const conflict = (code: string) => new ConflictError('x', 409, { code });
    expect(retryDelayMs(conflict('idempotency_in_progress'), 0)).toBe(2000);
    expect(retryDelayMs(conflict('wrong_account'), 0)).toBeNull();
    expect(retryDelayMs(new ConflictError('already in a binder', 409), 0)).toBeNull();
    expect(retryDelayMs(new NetworkError('x'), 3)).toBeNull();
  });
});
