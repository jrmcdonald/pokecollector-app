/**
 * The Collection screen's folding filters, its toggles and Clear, found the
 * way VoiceOver finds them: by role and accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { BinderCards, CollectionItem } from '@/api/schemas';
import Collection from '@/app/collection';

type HeaderItem = { label: string; accessibilityLabel: string; onPress(): void };
jest.mock('expo-router', () => {
  const { Pressable: P, Text: T } = jest.requireActual('react-native');
  return {
    router: { push: jest.fn() },
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

// Made-up cards: Pikachu is in a binder, Eevee is owned twice.
function entry(id: number, cardId: string, name: string, quantity = 1): CollectionItem {
  return {
    id,
    card_id: cardId,
    quantity,
    condition: 'NM',
    variant: 'Normal',
    card: { id: cardId, name, number: String(id) },
  };
}
const COLLECTION = [
  entry(1, 'sv01-057_en', 'Pikachu'),
  entry(2, 'sv03-133_en', 'Eevee', 2),
  entry(3, 'sv02-001_en', 'Sprigatito'),
];
const BINDER: BinderCards = {
  binder: { id: 1, name: 'Trade binder', binder_type: 'collection', card_count: 1 },
  cards: [{ id: 'sv01-057_en', binder_card_id: 7, name: 'Pikachu', collection_item_id: 1 }],
};

let queryClient: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  mockRequest.mockImplementation(async (path: string) => {
    if (path === '/api/collection/') return COLLECTION;
    if (path === '/api/binders/') return [BINDER.binder];
    if (path === '/api/binders/1/cards') return BINDER;
    if (path === '/api/decks/') return [];
    throw new Error(`Unexpected GET ${path}`);
  });
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

const requested = () => mockRequest.mock.calls.map(([path]) => path);

async function openFilters() {
  await render(withQueries(<Collection />));
  expect(await screen.findByText('3 entries')).toBeTruthy();
  // Folded away until asked for.
  expect(screen.queryByRole('switch', { name: 'Duplicates' })).toBeNull();
  await userEvent.press(screen.getByRole('button', { name: 'Show filters and sort' }));
}

describe('Collection', () => {
  it('shows duplicates, and clears back to everything', async () => {
    await openFilters();
    await userEvent.press(screen.getByRole('switch', { name: 'Duplicates' }));
    expect(screen.getByRole('switch', { name: 'Duplicates' })).toBeChecked();
    expect(await screen.findByText('1 of 3 entries')).toBeTruthy();

    // Folded away, the header still says a filter is on, and Clear stays.
    await userEvent.press(screen.getByRole('button', { name: 'Hide filters and sort, 1 on' }));
    expect(screen.queryByRole('switch', { name: 'Duplicates' })).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('3 entries')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show filters and sort' })).toBeTruthy();
    expect(requested()).toEqual(['/api/collection/']);
  });

  it('reads the binders and decks only once asked what is not in one', async () => {
    await openFilters();
    expect(screen.getByRole('button', { name: /^Pikachu/ })).toBeTruthy();
    expect(requested()).toEqual(['/api/collection/']);

    await userEvent.press(screen.getByRole('switch', { name: 'Not in a binder or deck' }));
    expect(await screen.findByText('2 of 3 entries')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Pikachu/ })).toBeNull();
    await waitFor(() =>
      expect(requested()).toEqual(
        expect.arrayContaining(['/api/binders/', '/api/binders/1/cards', '/api/decks/']),
      ),
    );

    // Both at once: Eevee is the loose card owned twice.
    await userEvent.press(screen.getByRole('switch', { name: 'Duplicates' }));
    expect(await screen.findByText('1 of 3 entries')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Eevee/ })).toBeTruthy();
  });
});
