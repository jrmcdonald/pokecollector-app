/**
 * A scanned card looked up rather than added, found the way VoiceOver finds
 * it: by role and accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { Card, CollectionItem, ScanMatch, WishlistItem } from '@/api/schemas';

import { LookupResult } from '../scan/lookup-result';

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
    getClient: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
  }),
}));

const pikachu: ScanMatch = {
  id: 'sv1-025_en',
  tcg_card_id: 'sv1-025',
  name: 'Pikachu',
  number: '025',
  set_abbreviation: 'svi',
};

const card: Card = {
  id: 'sv1-025_en',
  name: 'Pikachu',
  price_trend: 4.2,
  price_market: 3.9,
  price_low: 2.5,
  price_avg30: 4.5,
};

const owned: CollectionItem = {
  id: 1,
  card_id: 'sv1-025_en',
  quantity: 2,
  condition: 'NM',
  variant: 'Normal',
};

let queryClient: QueryClient;
beforeEach(() => {
  mockRequest.mockReset();
  // Requests fail at once unless a test says otherwise: a request left
  // pending would keep Jest from exiting.
  mockRequest.mockRejectedValue(new Error('Offline in tests'));
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

async function renderResult(props: Partial<Parameters<typeof LookupResult>[0]> = {}) {
  const handlers = {
    onScanAnother: jest.fn(),
    onOpen: jest.fn(),
    onAdd: jest.fn(),
  };
  await render(withQueries(<LookupResult match={pikachu} {...handlers} {...props} />));
  return handlers;
}

describe('LookupResult', () => {
  it('reads the trend price, the others, and how many are owned', async () => {
    queryClient.setQueryData(['acct', 'card', 'sv1-025_en'], card);
    queryClient.setQueryData(['acct', 'collection'], [owned]);
    await renderResult();
    expect(
      await screen.findByLabelText('Trend price: €4.20, Cardmarket, in euros'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Low: €2.50, Market: €3.90, 30-day: €4.50')).toBeOnTheScreen();
    expect(screen.getByLabelText('You own: 2 (Normal NM)')).toBeOnTheScreen();
  });

  it('says when the card is not owned', async () => {
    queryClient.setQueryData(['acct', 'card', 'sv1-025_en'], card);
    queryClient.setQueryData(['acct', 'collection'], []);
    await renderResult();
    expect(await screen.findByLabelText('Not in your collection')).toBeOnTheScreen();
  });

  it('offers to try again when the price cannot be fetched', async () => {
    await renderResult();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('scans another, opens the card, or adds it after all', async () => {
    queryClient.setQueryData(['acct', 'card', 'sv1-025_en'], card);
    const handlers = await renderResult();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Scan another' }));
    await user.press(screen.getByRole('button', { name: 'Open the card' }));
    await user.press(screen.getByRole('button', { name: 'Add to collection…' }));
    expect(handlers.onScanAnother).toHaveBeenCalled();
    expect(handlers.onOpen).toHaveBeenCalled();
    expect(handlers.onAdd).toHaveBeenCalled();
  });

  it('goes back to the other matches only when there are some', async () => {
    const onBack = jest.fn();
    await renderResult({ onBack });
    await userEvent.setup().press(screen.getByRole('button', { name: 'Not this one?' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('has no way back when this was the only match', async () => {
    await renderResult();
    expect(screen.queryByRole('button', { name: 'Not this one?' })).toBeNull();
  });

  it('adds the card to the wishlist', async () => {
    mockRequest.mockImplementation((path: string) =>
      path === '/api/wishlist/'
        ? Promise.resolve({ id: 3, card_id: 'sv1-025_en', quantity: 1 })
        : Promise.reject(new Error('Offline in tests')),
    );
    await renderResult();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Add to wishlist' }));
    expect(await screen.findByRole('button', { name: 'On your wishlist' })).toBeDisabled();
  });

  it('knows a card already on the wishlist', async () => {
    const wished: WishlistItem = { id: 3, card_id: 'sv1-025_en', quantity: 1 };
    queryClient.setQueryData(['acct', 'wishlist'], [wished]);
    await renderResult();
    expect(screen.getByRole('button', { name: 'On your wishlist' })).toBeDisabled();
  });
});
