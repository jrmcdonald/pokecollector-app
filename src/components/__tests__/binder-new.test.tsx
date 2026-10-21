/**
 * Creating a binder, from the Binders tab, found the way VoiceOver finds it:
 * by role and accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { Binder } from '@/api/schemas';
import Binders from '@/app/(tabs)/binders';
import NewBinder from '@/app/binder-new';

const mockPush = jest.fn();
const mockReplace = jest.fn();
type HeaderItem = { label: string; accessibilityLabel: string; onPress(): void };
jest.mock('expo-router', () => {
  const { Pressable: P, Text: T } = jest.requireActual('react-native');
  return {
    router: {
      push: (...args: unknown[]) => mockPush(...args),
      replace: (...args: unknown[]) => mockReplace(...args),
    },
    Stack: {
      Screen: ({ options }: { options: { unstable_headerRightItems?: () => HeaderItem[] } }) =>
        (options.unstable_headerRightItems?.() ?? []).map((item: HeaderItem) => (
          <P
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.accessibilityLabel}
            onPress={item.onPress}>
            <T>{item.label}</T>
          </P>
        )),
    },
  };
});
jest.mock('@shopify/flash-list', () => {
  const { FlatList } = jest.requireActual('react-native');
  return { FlashList: FlatList };
});

const mockRequest = jest.fn();
jest.mock('@/session/session', () => ({
  useSession: () => ({
    session: { status: 'signedIn', cacheId: 'acct' },
    getClient: () => ({ request: mockRequest }),
  }),
}));

let queryClient: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  mockRequest.mockRejectedValue(new Error('Offline in tests'));
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('Binders', () => {
  it('opens a new binder from the header, and from an empty list', async () => {
    queryClient.setQueryData(['acct', 'binders'], []);
    await render(withQueries(<Binders />));
    const [header, empty] = screen.getAllByRole('button', { name: 'New binder' });
    await userEvent.press(header!);
    await userEvent.press(empty!);
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith('/binder-new');
  });
});

describe('NewBinder', () => {
  it('asks for a name before creating anything', async () => {
    await render(withQueries(<NewBinder />));
    await userEvent.press(screen.getByRole('button', { name: 'Create binder' }));
    expect(screen.getByLabelText('Name')).toHaveProp(
      'accessibilityHint',
      'Give the binder a name.',
    );
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('creates a planned binder in the chosen colour, then opens it', async () => {
    const created: Binder = {
      id: 12,
      name: 'Eeveelutions',
      binder_type: 'wishlist',
      color: '#3B82F6',
    };
    mockRequest.mockResolvedValue(created);
    await render(withQueries(<NewBinder />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), '  Eeveelutions ');
    await user.press(screen.getByRole('radio', { name: 'Planned, 2 of 2' }));
    await user.press(screen.getByRole('radio', { name: 'Blue' }));
    expect(screen.getByRole('radio', { name: 'Blue' })).toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Create binder' }));

    expect(mockRequest).toHaveBeenCalledWith('/api/binders/', {
      method: 'POST',
      json: { name: 'Eeveelutions', binder_type: 'wishlist', color: '#3B82F6' },
      schema: expect.anything(),
    });
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/binder/[id]',
        params: { id: '12', name: 'Eeveelutions' },
      }),
    );
    // The new binder's page needs no request of its own.
    expect(queryClient.getQueryData(['acct', 'binder', 12])).toMatchObject({ cards: [] });
  });
});
