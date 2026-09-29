import {
  addableItems,
  batchPollDelay,
  batchProgress,
  defaultChoice,
  itemState,
  runAddQueue,
  type QueueEvent,
} from '../batch';
import { ConflictError, NetworkError, RateLimitError, ValidationError } from '../errors';
import type { ScanItem, ScanJob } from '../schemas';

const pikachu = { id: 'sv1-025_en', tcg_card_id: 'sv1-025', name: 'Pikachu', number: '025' };
const raichu = { id: 'sv1-026_en', tcg_card_id: 'sv1-026', name: 'Raichu', number: '026' };

function item(id: number, status: string, extra: Partial<ScanItem> = {}): ScanItem {
  return { id, position: id - 1, status, resolved: false, ...extra };
}

function job(items: ScanItem[], extra: Partial<ScanJob> = {}): ScanJob {
  return { id: 4, status: 'running', items, ...extra };
}

/** A clock that only moves when the code under test sleeps. */
function fakeTime() {
  let t = 0;
  const slept: number[] = [];
  return {
    now: () => t,
    slept,
    advance: (ms: number) => {
      t += ms;
    },
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
  };
}

describe('batchPollDelay', () => {
  const reading = job([item(1, 'processing'), item(2, 'done')]);

  it('eases from 3 s to 10 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map((n) => batchPollDelay(n, reading, 0))).toEqual([
      3000, 3000, 4000, 5000, 6000, 8000, 10000, 10000, 10000,
    ]);
  });

  it('stops once nothing is left to read', () => {
    expect(batchPollDelay(0, job([item(1, 'done'), item(2, 'failed')]), 0)).toBe(false);
    expect(batchPollDelay(0, undefined, 0)).toBe(false);
  });

  it('uses the counts when the job has no items', () => {
    expect(batchPollDelay(0, { id: 4, status: 'running', active: 2 }, 0)).toBe(3000);
    expect(batchPollDelay(0, { id: 4, status: 'done', active: 0 }, 0)).toBe(false);
  });

  it('waits for upstream’s retry when every photo left is retrying', () => {
    const now = Date.parse('2026-09-29T10:00:00Z');
    const waiting = job([item(1, 'retrying'), item(2, 'done')], {
      active: 1,
      retrying: 1,
      next_retry_at: '2026-09-29T10:00:20',
    });
    expect(batchPollDelay(0, waiting, now)).toBe(20_500);
    const far = { ...waiting, next_retry_at: '2026-09-29T11:00:00' };
    expect(batchPollDelay(0, far, now)).toBe(30_000);
  });
});

describe('itemState and batchProgress', () => {
  const items = [
    item(1, 'pending'),
    item(2, 'done', { matches: [pikachu] }),
    item(3, 'done', { matches: [] }),
    item(4, 'failed', { error: 'x' }),
    item(5, 'done', { matches: [pikachu], resolved: true }),
  ];

  it('names each photo’s state', () => {
    expect(items.map(itemState)).toEqual(['reading', 'ready', 'unmatched', 'failed', 'handled']);
  });

  it('counts them', () => {
    expect(batchProgress(job(items))).toEqual({
      total: 5,
      read: 4,
      reading: 1,
      ready: 1,
      unmatched: 1,
      failed: 1,
      handled: 1,
    });
  });
});

describe('defaultChoice', () => {
  it('prefers the candidate whose number was read off the card', () => {
    const choice = defaultChoice(
      item(1, 'done', { matches: [pikachu, raichu], recognized: { number_local: '26/198' } }),
    );
    expect(choice.pick).toEqual({ kind: 'candidate', match: expect.objectContaining(raichu) });
    expect(choice).toMatchObject({ variant: 'Normal', condition: 'NM', quantity: 1 });
  });

  it('picks nothing when there is nothing to pick', () => {
    expect(defaultChoice(item(1, 'failed')).pick).toBeNull();
  });
});

describe('addableItems', () => {
  it('takes ready photos, and failed ones given a card from search', () => {
    const items = [
      item(1, 'done', { matches: [pikachu] }),
      item(2, 'processing'),
      item(3, 'failed'),
      item(4, 'failed'),
      item(5, 'done', { matches: [pikachu], resolved: true }),
      item(6, 'done', { matches: [] }),
    ];
    const searched = {
      pick: { kind: 'search' as const, card: { id: 'sv1-025_en', name: 'Pikachu' } },
      variant: 'Normal' as const,
      condition: 'NM' as const,
      quantity: 1,
      printing_details: [],
    };
    expect(addableItems(items, { 3: searched }).map((i) => i.id)).toEqual([1, 3]);
  });
});

describe('runAddQueue', () => {
  it('adds one after another, at least a second apart', async () => {
    const time = fakeTime();
    const starts: number[] = [];
    const result = await runAddQueue(
      [1, 2, 3],
      async () => {
        starts.push(time.now());
        time.advance(200);
      },
      time,
    );
    expect(result.added).toEqual([1, 2, 3]);
    expect(starts).toEqual([0, 1000, 2000]);
  });

  it('waits out a 429 and tries the same card again', async () => {
    const time = fakeTime();
    let calls = 0;
    const events: QueueEvent[] = [];
    const result = await runAddQueue(
      [1, 2],
      async () => {
        calls += 1;
        if (calls === 1) throw new RateLimitError('Slow down', 20);
      },
      { ...time, onEvent: (e) => events.push(e) },
    );
    expect(result.added).toEqual([1, 2]);
    expect(events).toContainEqual({ type: 'waiting', seconds: 20 });
    expect(time.slept).toContain(20_000);
  });

  it('gives up for now after repeated 429s, leaving the rest', async () => {
    const result = await runAddQueue(
      [1, 2],
      async () => {
        throw new RateLimitError('Slow down');
      },
      { ...fakeTime(), maxRateLimitWaits: 2 },
    );
    expect(result.stopped).toBeInstanceOf(RateLimitError);
    expect(result.remaining).toEqual([1, 2]);
  });

  it('stops on a lost connection, since every card after would fail too', async () => {
    const result = await runAddQueue(
      [1, 2, 3],
      async (id) => {
        if (id === 2) throw new NetworkError('Offline');
      },
      fakeTime(),
    );
    expect(result.added).toEqual([1]);
    expect(result.stopped).toBeInstanceOf(NetworkError);
    expect(result.remaining).toEqual([2, 3]);
  });

  it('carries on past a card upstream refuses', async () => {
    const result = await runAddQueue(
      [1, 2],
      async (id) => {
        if (id === 1) throw new ValidationError('Confirmed card is not a scan candidate.', 422);
      },
      fakeTime(),
    );
    expect(result.failed).toEqual([
      { itemId: 1, message: 'Confirmed card is not a scan candidate.' },
    ]);
    expect(result.added).toEqual([2]);
  });

  it('counts a card already handled upstream as handled, not failed', async () => {
    const result = await runAddQueue(
      [1],
      async () => {
        throw new ConflictError('This scan has already been handled.', 409);
      },
      fakeTime(),
    );
    expect(result.handled).toEqual([1]);
    expect(result.failed).toEqual([]);
  });

  it('stops when cancelled', async () => {
    const abort = new AbortController();
    const result = await runAddQueue(
      [1, 2],
      async () => {
        abort.abort();
      },
      { ...fakeTime(), signal: abort.signal },
    );
    expect(result.added).toEqual([1]);
    expect(result.remaining).toEqual([2]);
    expect(result.stopped?.name).toBe('ScanCancelled');
  });
});
