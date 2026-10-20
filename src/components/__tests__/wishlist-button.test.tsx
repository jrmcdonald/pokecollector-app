/**
 * The wishlist button on a card's page, found the way VoiceOver finds it: by
 * role and accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { WishlistItem } from '@/api/schemas';

import { WishlistButton } from '../wishlist-button';

const mockRequest = jest.fn();
jest.mock('@/session/session', () => ({
  useSession: () => ({
    session: { status: 'signedIn', cacheId: 'acct' },
    getClient: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
  }),
}));

const ITEM: WishlistItem = { id: 3, card_id: 'sv1-025_en', quantity: 1 };

let queryClient: QueryClient;
beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockRejectedValue(new Error('Offline in tests'));
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('WishlistButton', () => {
  it('adds a card, then offers to take it off again', async () => {
    queryClient.setQueryData(['acct', 'wishlist'], []);
    // The server's wishlist, as the requests change it.
    let server: WishlistItem[] = [];
    mockRequest.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'POST') server = [ITEM];
      if (init?.method === 'DELETE') server = [];
      return Promise.resolve(
        init?.method === 'POST' ? ITEM : path === '/api/wishlist/' ? server : {},
      );
    });
    await render(withQueries(<WishlistButton cardId="sv1-025_en" disabled={false} />));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Add to wishlist' }));
    expect(mockRequest).toHaveBeenCalledWith('/api/wishlist/', {
      method: 'POST',
      json: { card_id: 'sv1-025_en', quantity: 1 },
      schema: expect.anything(),
    });
    await user.press(await screen.findByRole('button', { name: 'Remove from wishlist' }));
    expect(mockRequest).toHaveBeenCalledWith('/api/wishlist/3', { method: 'DELETE' });
    expect(await screen.findByRole('button', { name: 'Add to wishlist' })).toBeOnTheScreen();
  });

  it('puts a card back when the server will not take it off', async () => {
    queryClient.setQueryData(['acct', 'wishlist'], [ITEM]);
    await render(withQueries(<WishlistButton cardId="sv1-025_en" disabled={false} />));
    await userEvent.setup().press(screen.getByRole('button', { name: 'Remove from wishlist' }));
    expect(await screen.findByRole('button', { name: 'Remove from wishlist' })).toBeEnabled();
  });

  it('cannot change anything offline', async () => {
    queryClient.setQueryData(['acct', 'wishlist'], [ITEM]);
    await render(withQueries(<WishlistButton cardId="sv1-025_en" disabled />));
    expect(screen.getByRole('button', { name: 'Remove from wishlist' })).toBeDisabled();
  });
});
