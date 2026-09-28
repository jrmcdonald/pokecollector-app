import { PokeCollectorClient } from '../client';
import { MISSING_KEY, ScanTimedOut, nextDelay, searchTermFor, waitForScan } from '../scan';
import { candidatesOf } from '../schemas';
import { CREDENTIALS, fakeFetch, loginOk } from './fake-server';

function item(status: string, extra: Record<string, unknown> = {}) {
  return { id: 7, status, resolved: false, ...extra };
}

/** A clock that only moves when the code under test sleeps. */
function fakeTime() {
  let t = 0;
  const slept: number[] = [];
  return {
    now: () => t,
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
  };
}

describe('waitForScan', () => {
  it('polls with growing gaps until the item is done', async () => {
    const statuses = ['pending', 'processing', 'processing', 'done'];
    const { fetch, calls } = fakeFetch(({ url }) => {
      if (url.endsWith('/login')) return loginOk('t');
      const status = statuses.shift() ?? 'done';
      return { status: 200, body: { id: 3, status: 'running', items: [item(status)] } };
    });
    const time = fakeTime();
    const seen: string[] = [];
    const result = await waitForScan(new PokeCollectorClient(CREDENTIALS, fetch), 3, {
      ...time,
      onProgress: (i) => seen.push(i.status),
    });
    expect(result.status).toBe('done');
    expect(time.slept).toEqual([1000, 2000, 4000, 8000]);
    expect(seen).toEqual(['pending', 'processing', 'processing', 'done']);
    expect(calls.filter((c) => c.url.endsWith('/recognize/jobs/3'))).toHaveLength(4);
  });

  it('stops at failed as well as done', async () => {
    const { fetch } = fakeFetch(({ url }) =>
      url.endsWith('/login')
        ? loginOk('t')
        : {
            status: 200,
            body: { id: 3, status: 'failed', items: [item('failed', { error: 'x' })] },
          },
    );
    const result = await waitForScan(new PokeCollectorClient(CREDENTIALS, fetch), 3, fakeTime());
    expect(result.error).toBe('x');
  });

  it('gives up after the maximum wait', async () => {
    const { fetch } = fakeFetch(({ url }) =>
      url.endsWith('/login')
        ? loginOk('t')
        : { status: 200, body: { id: 3, status: 'running', items: [item('processing')] } },
    );
    await expect(
      waitForScan(new PokeCollectorClient(CREDENTIALS, fetch), 3, {
        ...fakeTime(),
        maxWaitMs: 20_000,
      }),
    ).rejects.toBeInstanceOf(ScanTimedOut);
  });
});

describe('nextDelay', () => {
  it('waits for a scheduled upstream retry, within limits', () => {
    const now = Date.parse('2026-09-28T10:00:00Z');
    const retrying = item('retrying', { next_attempt_at: '2026-09-28T10:00:10' });
    expect(nextDelay(0, retrying as never, now)).toBe(10_500);
    const far = item('retrying', { next_attempt_at: '2026-09-28T11:00:00' });
    expect(nextDelay(0, far as never, now)).toBe(30_000);
    expect(nextDelay(9, null, now)).toBe(8_000);
  });
});

describe('candidatesOf', () => {
  it('keeps well-formed candidates and skips the rest', () => {
    const good = { id: 'sv1-025_en', tcg_card_id: 'sv1-025', name: 'Pikachu', lang: 'en' };
    expect(candidatesOf({ matches: [good, { name: 'no ids' }, null] })).toEqual([good]);
    expect(candidatesOf({ matches: null })).toEqual([]);
  });
});

describe('searchTermFor', () => {
  it('uses the set code and number when both were read', () => {
    expect(searchTermFor({ name: 'Pikachu', set_code: 'SVI', number_local: '057' })).toBe(
      'SVI 057',
    );
  });

  it('falls back to the name, English first', () => {
    expect(searchTermFor({ name: 'Glurak', name_en: 'Charizard', number_local: 4 })).toBe(
      'Charizard',
    );
    expect(searchTermFor(null)).toBe('');
  });
});

describe('MISSING_KEY', () => {
  it("recognises upstream's missing-key messages, in German too", () => {
    expect(
      MISSING_KEY.test('Kein Gemini API Key konfiguriert. Bitte in den Einstellungen eintragen.'),
    ).toBe(true);
    expect(MISSING_KEY.test('No OpenAI API key configured. Add one in Settings first.')).toBe(true);
    expect(MISSING_KEY.test('Only JPEG, PNG, WebP, and HEIC scan photos are supported.')).toBe(
      false,
    );
  });
});
