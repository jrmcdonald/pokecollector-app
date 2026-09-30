/**
 * The batch scanning controls, found the way VoiceOver finds them: by role
 * and accessible name, with their state.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import { defaultChoice, MAX_BATCH_PHOTOS } from '@/api/batch';
import type { ScanItem } from '@/api/schemas';

import { BatchItemSheet } from '../scan/batch-item-sheet';
import { BatchRow } from '../scan/batch-row';
import { TrayButton, TraySheet } from '../scan/batch-tray';
import { ReviewEntry } from '../scan/review-entry';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

jest.mock('@/utils/batch-photos', () => ({ batchPhotoUri: () => null }));

jest.mock('@/session/session', () => ({
  useSession: () => ({
    session: {
      status: 'signedIn',
      cacheId: 'acct',
      accounts: [],
      credentials: { username: 'ash' },
      client: { activeBaseUrl: 'https://pc.example.com', accessHeaders: {}, sessionToken: 't' },
    },
    // Requests fail at once: these tests are about the controls, and a request
    // left pending would keep Jest from exiting.
    getClient: () => ({ request: () => Promise.reject(new Error('Offline in tests')) }),
  }),
}));

const pikachu = {
  id: 'sv1-025_en',
  tcg_card_id: 'sv1-025',
  name: 'Pikachu',
  number: '025',
  set_abbreviation: 'svi',
};
const raichu = {
  ...pikachu,
  id: 'sv1-026_en',
  tcg_card_id: 'sv1-026',
  name: 'Raichu',
  number: '026',
};

function item(status: string, extra: Partial<ScanItem> = {}): ScanItem {
  return { id: 7, position: 2, status, resolved: false, has_image: true, ...extra };
}

let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
// Clearing drops the queries' garbage-collection timers, which would
// otherwise keep Jest from exiting.
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('BatchRow', () => {
  it('reads the photo, the chosen card and how it goes in, and opens', async () => {
    const onPress = jest.fn();
    const ready = item('done', { matches: [pikachu] });
    await render(
      <BatchRow
        jobId={4}
        item={ready}
        choice={defaultChoice(ready)}
        outcome={undefined}
        onPress={onPress}
      />,
    );
    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: 'Photo 3, Pikachu, SVI 025 · Normal · NM' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('cannot be opened while the photo is still being read', async () => {
    const reading = item('processing');
    await render(
      <BatchRow
        jobId={4}
        item={reading}
        choice={defaultChoice(reading)}
        outcome={undefined}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /^Photo 3, Reading/ })).toBeDisabled();
  });

  it('says why a card was not added', async () => {
    const ready = item('done', { matches: [pikachu] });
    await render(
      <BatchRow
        jobId={4}
        item={ready}
        choice={defaultChoice(ready)}
        outcome={undefined}
        failure="Confirmed card is not a scan candidate."
        onPress={jest.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Not added: Confirmed card is not a scan candidate\.$/ }),
    ).toBeOnTheScreen();
  });
});

describe('ReviewEntry', () => {
  it('counts what is waiting and opens the list', async () => {
    await render(
      <ReviewEntry
        jobs={[
          { id: 1, status: 'done', attention: 2 },
          { id: 2, status: 'running', attention: 1, active: 3 },
        ]}
      />,
    );
    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: '3 scanned cards to review' }));
    expect(mockPush).toHaveBeenCalledWith('/scans');
  });

  it('shows nothing when nothing is waiting', async () => {
    await render(<ReviewEntry jobs={[]} />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});

describe('the batch tray', () => {
  const photos = [
    { key: 'a', uri: 'file:///a.jpg' },
    { key: 'b', uri: 'file:///b.jpg' },
  ];

  it('says how many photos are waiting', async () => {
    await render(<TrayButton photos={photos} onPress={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: '2 photos in this batch. Look through them' }),
    ).toBeOnTheScreen();
  });

  it('removes one photo, and cannot send offline', async () => {
    const onRemove = jest.fn();
    await render(
      <TraySheet
        visible
        photos={photos}
        sending={false}
        canSend={false}
        adding={false}
        onAdd={jest.fn()}
        onRemove={onRemove}
        onClear={jest.fn()}
        onSend={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    await userEvent.setup().press(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(onRemove).toHaveBeenCalledWith(photos[1]);
    expect(screen.getByRole('button', { name: 'Scan 2 cards' })).toBeDisabled();
  });

  it('adds photos from the library, offline too, until the batch is full', async () => {
    const onAdd = jest.fn();
    const sheet = (list: typeof photos) => (
      <TraySheet
        visible
        photos={list}
        sending={false}
        canSend={false}
        adding={false}
        onAdd={onAdd}
        onRemove={jest.fn()}
        onClear={jest.fn()}
        onSend={jest.fn()}
        onClose={jest.fn()}
      />
    );
    await render(sheet(photos));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add from your photos' }));
    expect(onAdd).toHaveBeenCalled();

    const full = Array.from({ length: MAX_BATCH_PHOTOS }, (_, i) => ({
      key: String(i),
      uri: `file:///${i}.jpg`,
    }));
    await render(sheet(full));
    expect(screen.getByRole('button', { name: 'Add from your photos' })).toBeDisabled();
  });
});

describe('BatchItemSheet', () => {
  const ready = item('done', { matches: [pikachu, raichu] });

  function Sheet(props: { onChange?: jest.Mock; onSkip?: jest.Mock }) {
    return withQueries(
      <BatchItemSheet
        jobId={4}
        item={ready}
        choice={defaultChoice(ready)}
        onChange={props.onChange ?? jest.fn()}
        onClose={jest.fn()}
        onSkip={props.onSkip ?? jest.fn()}
        onRetry={jest.fn()}
        busy={false}
        online
      />,
    );
  }

  it('marks the chosen candidate, and picks another', async () => {
    const onChange = jest.fn();
    await render(<Sheet onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Pikachu, SVI 025' })).toBeSelected();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Raichu, SVI 026' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        pick: { kind: 'candidate', match: expect.objectContaining(raichu) },
      }),
    );
  });

  it('asks before skipping a photo', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<Sheet />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Skip this photo' }));
    expect(alert).toHaveBeenCalledWith('Skip this photo?', expect.any(String), expect.any(Array));
    alert.mockRestore();
  });

  it('opens a search prefilled with what was read', async () => {
    const unmatched = item('done', {
      matches: [],
      recognized: { set_code: 'MEW', number_local: '133' },
    });
    await render(
      withQueries(
        <BatchItemSheet
          jobId={4}
          item={unmatched}
          choice={defaultChoice(unmatched)}
          onChange={jest.fn()}
          onClose={jest.fn()}
          onSkip={jest.fn()}
          onRetry={jest.fn()}
          busy={false}
          online
        />,
      ),
    );
    expect(screen.getByLabelText('Search the catalogue')).toHaveDisplayValue('MEW 133');
    // Let the search's debounce and its (failing) request finish inside the
    // test, so their state updates are not reported as outside act().
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
  });
});
