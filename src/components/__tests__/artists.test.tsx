/**
 * Artist pages (upstream 1.59.0, #472), found the way VoiceOver finds them:
 * the illustrator on a card's page, the directory with its search, and an
 * artist's checklist with "Missing only". On an older server, one 404 hides
 * the way in.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo } from 'react-native';

import { NotFoundError } from '@/api/errors';
import type { Card } from '@/api/schemas';
import ArtistChecklist from '@/app/artist/[name]';
import Artists from '@/app/artists';
import CardDetail from '@/app/card/[id]';
import { artistChecklist, artistIndex, artistMissing } from '@/api/__tests__/artist-fixtures';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));

const mockRequest = jest.fn();
jest.mock('@/session/session', () => ({
  useSession: () => ({
    session: {
      status: 'signedIn',
      cacheId: 'acct',
      accounts: [],
      credentials: { username: 'ash' },
      client: { activeBaseUrl: 'https://pc.example.com', proxyHeaders: {}, sessionToken: 't' },
    },
    getClient: () => ({ request: mockRequest }),
  }),
}));

const CARD: Card = {
  id: 'sv8-123_en',
  name: 'Pikachu ex',
  number: '123',
  set_id: 'sv8',
  artist: 'Mitsuhiro Arita',
};

let queryClient: QueryClient;
let server404 = false;

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  server404 = false;
  mockPush.mockReset();
  mockRequest.mockReset();
  mockRequest.mockImplementation(
    async (path: string, options?: { query?: Record<string, unknown> }) => {
      if (path.startsWith('/api/cards/artist')) {
        if (server404) throw new NotFoundError('Not Found', 404);
        if (path === '/api/cards/artists') return artistIndex;
        return options?.query?.ownership === 'missing' ? artistMissing : artistChecklist;
      }
      if (path === `/api/cards/${CARD.id}`) return CARD;
      if (path === '/api/collection/') return [];
      if (path === '/api/binders/' || path === '/api/decks/') return [];
      if (path === '/api/collection/printing-detail-tags' || path === '/api/wishlist/') return [];
      if (path.endsWith('/price-history')) return [];
      throw new Error(`Unexpected request: ${path}`);
    },
  );
});
afterEach(() => queryClient.clear());

const show = (ui: ReactElement) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
const artistRequests = () =>
  mockRequest.mock.calls.filter(([path]) => String(path).startsWith('/api/cards/artist'));

describe("a card's illustrator", () => {
  it('links to the artist’s checklist', async () => {
    mockParams = { id: CARD.id };
    await show(<CardDetail />);
    const link = await screen.findByRole('link', { name: 'Illustrated by Mitsuhiro Arita' });
    await userEvent.setup().press(link);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/artist/[name]',
      params: { name: 'Mitsuhiro Arita' },
    });
    // Showing the link costs nothing.
    expect(artistRequests()).toHaveLength(0);
  });

  it('is plain text once the server has said it has no artist pages', async () => {
    queryClient.setQueryData(['acct', 'feature', 'artists-missing'], Date.now());
    mockParams = { id: CARD.id };
    await show(<CardDetail />);
    expect(await screen.findByText('Illustrated by Mitsuhiro Arita')).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: /Illustrated by/ })).toBeNull();
  });

  it('links again a day later, in case the server was updated', async () => {
    queryClient.setQueryData(
      ['acct', 'feature', 'artists-missing'],
      Date.now() - 25 * 60 * 60 * 1000,
    );
    mockParams = { id: CARD.id };
    await show(<CardDetail />);
    expect(
      await screen.findByRole('link', { name: 'Illustrated by Mitsuhiro Arita' }),
    ).toBeOnTheScreen();
  });
});

describe("an artist's checklist", () => {
  beforeEach(() => {
    mockParams = { name: 'Mitsuhiro Arita' };
  });

  it('shows the artist’s progress and every card, owned or missing', async () => {
    await show(<ArtistChecklist />);
    expect(await screen.findByLabelText('1 of 4 cards owned, 25 percent')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Mew, missing/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Pikachu ex, 2 owned/ })).toBeOnTheScreen();
  });

  it('asks upstream for missing cards only, keeping the header up meanwhile', async () => {
    await show(<ArtistChecklist />);
    await screen.findByLabelText('1 of 4 cards owned, 25 percent');
    await userEvent.setup().press(screen.getByRole('radio', { name: /Missing only/ }));
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/api/cards/artist-checklist',
      expect.objectContaining({
        query: expect.objectContaining({ ownership: 'missing', artist_match: 'exact' }),
      }),
    );
    await screen.findByRole('radio', { name: /Missing only/, selected: true });
    expect(screen.queryByRole('button', { name: /^Pikachu ex/ })).toBeNull();
  });

  it('says so on an older server, and hides the way in from then on', async () => {
    server404 = true;
    await show(<ArtistChecklist />);
    expect(await screen.findByText('Not on this server yet')).toBeOnTheScreen();
    // One request, never retried: a 404 is an answer.
    expect(artistRequests()).toHaveLength(1);
    expect(queryClient.getQueryData(['acct', 'feature', 'artists-missing'])).toEqual(
      expect.any(Number),
    );
  });
});

describe('the artist directory', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists artists with their progress, and opens one', async () => {
    await show(<Artists />);
    await act(() => jest.runOnlyPendingTimersAsync());
    const arita = await screen.findByRole('button', {
      name: 'Mitsuhiro Arita, 1 of 4 cards owned',
    });
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(arita);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/artist/[name]',
      params: { name: 'Mitsuhiro Arita' },
    });
  });

  it('searches once typing pauses for 400 ms, not on every letter', async () => {
    await show(<Artists />);
    await act(() => jest.runOnlyPendingTimersAsync());
    expect(artistRequests()).toHaveLength(1);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime, delay: 0 });
    // Five letters typed at once: the debounce restarts with each.
    await user.type(screen.getByLabelText('Search artists'), 'arita');
    await act(() => jest.advanceTimersByTimeAsync(399));
    expect(artistRequests()).toHaveLength(1);
    await act(() => jest.advanceTimersByTimeAsync(1));
    expect(artistRequests()).toHaveLength(2);
    expect(artistRequests()[1]?.[1]).toMatchObject({ query: { q: 'arita' } });
  });
});
