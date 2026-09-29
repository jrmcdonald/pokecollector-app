import { defaultChoice, type BatchChoice } from '@/api/batch';
import type { ScanItem } from '@/api/schemas';

import { copyLine, describeRow, pickCard, progressLine } from '../batch-review';

const pikachu = {
  id: 'sv1-025_en',
  tcg_card_id: 'sv1-025',
  name: 'Pikachu',
  number: '025',
  set_abbreviation: 'svi',
};

function item(status: string, extra: Partial<ScanItem> = {}): ScanItem {
  return { id: 7, position: 2, status, resolved: false, ...extra };
}

describe('pickCard', () => {
  it('describes a candidate and a search result the same way', () => {
    expect(pickCard({ kind: 'candidate', match: pikachu })).toMatchObject({
      name: 'Pikachu',
      code: 'SVI 025',
    });
    expect(
      pickCard({
        kind: 'search',
        card: { id: 'sv1-025_en', name: 'Pikachu', number: '025', set_id: 'sv1' },
      }),
    ).toMatchObject({ name: 'Pikachu', code: 'SV1 025' });
  });
});

describe('copyLine', () => {
  it('mentions copies only when there is more than one', () => {
    expect(copyLine({ variant: 'Normal', condition: 'NM', quantity: 1 })).toBe('Normal · NM');
    expect(copyLine({ variant: 'Holo', condition: 'LP', quantity: 2 })).toBe(
      'Holo · LP · 2 copies',
    );
  });
});

describe('describeRow', () => {
  const ready = item('done', { matches: [pikachu] });

  it('names the chosen card and how it goes in', () => {
    expect(describeRow(ready, defaultChoice(ready), undefined)).toEqual({
      title: 'Pikachu',
      detail: 'SVI 025 · Normal · NM',
    });
  });

  it('says a search pick came from search', () => {
    const choice: BatchChoice = {
      ...defaultChoice(item('failed')),
      pick: { kind: 'search', card: { id: 'x', name: 'Eevee', number: '133', set_id: 'mew' } },
    };
    expect(describeRow(item('failed'), choice, undefined).detail).toBe(
      'From search · MEW 133 · Normal · NM',
    );
  });

  it('says what happened to a handled photo', () => {
    const done = { ...ready, resolved: true };
    expect(describeRow(done, defaultChoice(done), 'added')).toEqual({
      title: 'Pikachu',
      detail: 'Added',
    });
    expect(describeRow(done, defaultChoice(done), 'skipped')).toEqual({
      title: 'Photo 3',
      detail: 'Skipped',
    });
    expect(describeRow(done, defaultChoice(done), undefined).detail).toBe(
      'Already added or skipped',
    );
  });

  it('explains photos with nothing to add', () => {
    const none = item('done', { matches: [] });
    expect(describeRow(none, defaultChoice(none), undefined).title).toBe('No match');
    const failed = item('failed', { error: 'The model could not read the card.' });
    expect(describeRow(failed, defaultChoice(failed), undefined)).toEqual({
      title: 'Couldn’t read this card',
      detail: 'The model could not read the card.',
    });
  });
});

describe('progressLine', () => {
  const base = { total: 30, read: 12, reading: 18, ready: 10, unmatched: 1, failed: 1, handled: 0 };

  it('counts what is read while reading', () => {
    expect(progressLine(base)).toBe('12 of 30 read');
  });

  it('then says what is left', () => {
    expect(progressLine({ ...base, read: 30, reading: 0, ready: 26, handled: 2 })).toBe(
      '26 ready · 1 with no match · 1 not read · 2 done',
    );
    expect(
      progressLine({
        ...base,
        read: 30,
        reading: 0,
        ready: 0,
        unmatched: 0,
        failed: 0,
        handled: 30,
      }),
    ).toBe('All done');
  });
});
