/**
 * Editing a binder, and the printing details folded away, found the way
 * VoiceOver finds them: by role and accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import type { BinderCards } from '@/api/schemas';
import BinderDetail from '@/app/binder/[id]';

import { PrintingDetailsPicker } from '../printing-details-picker';

const mockBack = jest.fn();
type HeaderItem = { label: string; accessibilityLabel: string; onPress(): void };
jest.mock('expo-router', () => {
  const { Pressable: P, Text: T } = jest.requireActual('react-native');
  return {
    router: { push: jest.fn(), back: () => mockBack() },
    useLocalSearchParams: () => ({ id: '1' }),
    // The header's buttons, drawn where the test can press them.
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

const mockPick = jest.fn();
jest.mock('@/utils/pick', () => ({ pick: (...args: unknown[]) => mockPick(...args) }));

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

const BINDER: BinderCards = {
  binder: { id: 1, name: '151 master set', binder_type: 'wishlist', color: '#3B82F6' },
  cards: [
    {
      id: 'sv3pt5-004_en',
      binder_card_id: 7,
      name: 'Charmander',
      number: '004',
      required_quantity: 2,
      owned: false,
      missing_quantity: 2,
    },
  ],
  owned_count: 0,
  total_count: 2,
};

let queryClient: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  mockRequest.mockImplementation(async (path: string, options: { method?: string } = {}) => {
    if (path === '/api/binders/1/cards' && !options.method) return BINDER;
    if (path === '/api/binders/' && !options.method) return [BINDER.binder];
    if (path === '/api/collection/printing-detail-tags') return [];
    throw new Error(`Unexpected ${options.method ?? 'GET'} ${path}`);
  });
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

async function startEditing() {
  await render(withQueries(<BinderDetail />));
  await userEvent.press(await screen.findByRole('button', { name: 'Edit this binder' }));
}

describe('BinderDetail', () => {
  it('edits the copies of a card, and saves them', async () => {
    await startEditing();
    expect(screen.getByRole('button', { name: 'Add a card' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete binder' })).toBeTruthy();

    mockRequest.mockImplementationOnce(async () => ({ message: 'Binder entry updated' }));
    await userEvent.press(screen.getByRole('button', { name: 'Increase Charmander' }));
    await userEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('/api/binders/1/entries/7', {
        method: 'PUT',
        json: { required_quantity: 3 },
      }),
    );
  });

  it('takes a card out at 0', async () => {
    await startEditing();
    mockRequest.mockImplementationOnce(async () => ({ message: 'Card removed from binder' }));
    await userEvent.press(screen.getByRole('button', { name: 'Decrease Charmander' }));
    await userEvent.press(screen.getByRole('button', { name: 'Remove one of Charmander' }));
    await userEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('/api/binders/1/entries/7', { method: 'DELETE' }),
    );
  });

  it('renames the binder', async () => {
    const prompt = jest.spyOn(Alert, 'prompt').mockImplementation((_t, _m, buttons) => {
      if (!Array.isArray(buttons)) return;
      const rename = buttons[1]?.onPress as ((text: string) => void) | undefined;
      rename?.('  Kanto  ');
    });
    await startEditing();
    mockRequest.mockImplementationOnce(async () => ({ ...BINDER.binder, name: 'Kanto' }));
    await userEvent.press(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('/api/binders/1', {
        method: 'PUT',
        json: { name: 'Kanto' },
        schema: expect.anything(),
      }),
    );
    prompt.mockRestore();
  });

  it('changes its colour, marking the current one', async () => {
    await startEditing();
    mockPick.mockResolvedValueOnce(2);
    mockRequest.mockImplementationOnce(async () => ({ ...BINDER.binder, color: '#22C55E' }));
    await userEvent.press(screen.getByRole('button', { name: 'Colour' }));
    expect(mockPick).toHaveBeenCalledWith(
      'Binder colour',
      expect.arrayContaining(['Blue (current)', 'Green']),
    );
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('/api/binders/1', {
        method: 'PUT',
        json: { color: '#22C55E' },
        schema: expect.anything(),
      }),
    );
  });

  it('deletes the binder once confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Delete')?.onPress?.();
    });
    await startEditing();
    mockRequest.mockImplementationOnce(async () => ({ message: 'Binder deleted' }));
    await userEvent.press(screen.getByRole('button', { name: 'Delete binder' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockRequest).toHaveBeenCalledWith('/api/binders/1', { method: 'DELETE' });
    alert.mockRestore();
  });
});

describe('PrintingDetailsPicker', () => {
  beforeEach(() => {
    mockRequest.mockImplementation(async () => [{ id: 1, name: 'Stamped' }]);
  });

  it('starts folded away, saying what is chosen, and opens', async () => {
    const onChange = jest.fn();
    await render(withQueries(<PrintingDetailsPicker value={[]} onChange={onChange} />));
    const toggle = screen.getByRole('button', { name: 'Printing details, None', expanded: false });
    expect(screen.queryByRole('checkbox', { name: 'Stamped' })).toBeNull();

    await userEvent.press(toggle);
    expect(
      screen.getByRole('button', { name: 'Printing details, None', expanded: true }),
    ).toBeTruthy();
    await userEvent.press(await screen.findByRole('checkbox', { name: 'Stamped' }));
    expect(onChange).toHaveBeenCalledWith(['Stamped']);
  });

  it('names the chosen details while folded', async () => {
    await render(
      withQueries(<PrintingDetailsPicker value={['Stamped', 'Staff']} onChange={jest.fn()} />),
    );
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.getByRole('button', { name: 'Printing details, Stamped, Staff' })).toBeTruthy();
  });
});
