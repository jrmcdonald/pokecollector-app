/**
 * Editing a deck, and finding a wishlist card for sale, found the way
 * VoiceOver finds them: by role and accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, Linking } from 'react-native';

import type { Deck, WishlistItem } from '@/api/schemas';
import DeckDetail from '@/app/deck/[id]';
import Wishlist from '@/app/wishlist';

import { EditableDeckEntryRow, SAVE_DELAY_MS } from '../deck-entry-row';

const mockBack = jest.fn();
type HeaderItem = { label: string; accessibilityLabel: string; onPress(): void };
jest.mock('expo-router', () => {
  const { Pressable: P, Text: T } = jest.requireActual('react-native');
  return {
    router: { push: jest.fn(), back: () => mockBack() },
    useLocalSearchParams: () => ({ id: '9' }),
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
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));

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

const PIKACHU = {
  id: 'sv01-057_en',
  name: 'Pikachu ex',
  number: '057',
  set_ref: { id: 'sv01_en', name: 'Scarlet & Violet', abbreviation: 'SVI', printed_total: 198 },
};

const DECK: Deck = {
  id: 9,
  name: 'Pikachu ex Battle Deck',
  binder_type: 'deck',
  current_card_count: 4,
  missing_copy_count: 4,
  entries: [{ id: 1, card_id: PIKACHU.id, required_quantity: 4, shortage: 4, card: PIKACHU }],
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
});
afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('EditableDeckEntryRow', () => {
  it('saves a run of taps once, when the copies stay put', async () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    await render(
      <EditableDeckEntryRow deck={DECK} entry={DECK.entries![0]!} onChange={onChange} />,
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Increase Pikachu ex' }));
    await user.press(screen.getByRole('button', { name: 'Increase Pikachu ex' }));
    await user.press(screen.getByRole('button', { name: 'Decrease Pikachu ex' }));
    expect(screen.getByLabelText('Pikachu ex: 5')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();

    await act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('saves nothing when the copies end where they began', async () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    await render(
      <EditableDeckEntryRow deck={DECK} entry={DECK.entries![0]!} onChange={onChange} />,
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Increase Pikachu ex' }));
    await user.press(screen.getByRole('button', { name: 'Decrease Pikachu ex' }));
    await act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('saves what was waiting when editing ends', async () => {
    const onChange = jest.fn();
    await render(
      <EditableDeckEntryRow deck={DECK} entry={DECK.entries![0]!} onChange={onChange} />,
    );
    await userEvent.press(screen.getByRole('button', { name: 'Decrease Pikachu ex' }));
    await screen.unmount();
    expect(onChange).toHaveBeenCalledWith(3);
  });
});

describe('DeckDetail', () => {
  beforeEach(() => {
    mockRequest.mockImplementation(async (path: string, options: { method?: string } = {}) => {
      if (path === '/api/decks/9' && !options.method) return DECK;
      if (path === '/api/decks/') return [];
      throw new Error(`Unexpected ${options.method ?? 'GET'} ${path}`);
    });
  });

  it('edits the copies of a card, and saves them', async () => {
    await render(withQueries(<DeckDetail />));
    await userEvent.press(await screen.findByRole('button', { name: 'Edit this deck' }));
    expect(screen.getByRole('button', { name: 'Add a card' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete deck' })).toBeTruthy();

    mockRequest.mockImplementationOnce(async () => ({
      ...DECK,
      entries: [{ ...DECK.entries![0]!, required_quantity: 3, shortage: 3 }],
    }));
    await userEvent.press(screen.getByRole('button', { name: 'Decrease Pikachu ex' }));
    await userEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('/api/decks/9/entries/1', {
        method: 'PATCH',
        json: { required_quantity: 3 },
        schema: expect.anything(),
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Pikachu ex, SVI 057, 3 copies, 3 missing' }),
    ).toBeTruthy();
  });

  it('takes a card out at 0', async () => {
    await render(withQueries(<DeckDetail />));
    await userEvent.press(await screen.findByRole('button', { name: 'Edit this deck' }));
    mockRequest.mockImplementationOnce(async () => ({ ...DECK, entries: [] }));
    const minus = screen.getByRole('button', { name: 'Decrease Pikachu ex' });
    for (let i = 0; i < 3; i++) await userEvent.press(minus);
    await userEvent.press(screen.getByRole('button', { name: 'Remove one of Pikachu ex' }));
    await userEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('/api/decks/9/entries/1', {
        method: 'DELETE',
        schema: expect.anything(),
      }),
    );
    expect(await screen.findByText('This deck has no cards')).toBeTruthy();
  });

  it('renames the deck', async () => {
    const prompt = jest.spyOn(Alert, 'prompt').mockImplementation((_t, _m, buttons) => {
      if (!Array.isArray(buttons)) return;
      const rename = buttons[1]?.onPress as ((text: string) => void) | undefined;
      rename?.('  Raichu Deck  ');
    });
    await render(withQueries(<DeckDetail />));
    await userEvent.press(await screen.findByRole('button', { name: 'Edit this deck' }));
    mockRequest.mockImplementationOnce(async () => ({ ...DECK, name: 'Raichu Deck' }));
    await userEvent.press(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('/api/decks/9', {
        method: 'PATCH',
        json: { name: 'Raichu Deck' },
        schema: expect.anything(),
      }),
    );
    prompt.mockRestore();
  });

  it('deletes the deck once confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Delete')?.onPress?.();
    });
    await render(withQueries(<DeckDetail />));
    await userEvent.press(await screen.findByRole('button', { name: 'Edit this deck' }));
    mockRequest.mockImplementationOnce(async () => ({ message: 'Deck deleted' }));
    await userEvent.press(screen.getByRole('button', { name: 'Delete deck' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockRequest).toHaveBeenCalledWith('/api/decks/9', { method: 'DELETE' });
    alert.mockRestore();
  });
});

describe('Wishlist', () => {
  const ITEM: WishlistItem = {
    id: 3,
    card_id: PIKACHU.id,
    quantity: 1,
    card: { ...PIKACHU, cardmarket_products: [{ variant: 'normal', product_id: 222 }] },
  };

  beforeEach(() => {
    mockRequest.mockImplementation(async (path: string) => {
      if (path === '/api/wishlist/') return [ITEM];
      throw new Error(`Unexpected ${path}`);
    });
  });

  it('finds a card for sale from the hold sheet', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockPick.mockResolvedValue(1);
    await render(withQueries(<Wishlist />));
    await userEvent.longPress(await screen.findByRole('button', { name: /^Pikachu ex/ }));
    expect(mockPick).toHaveBeenCalledWith(
      'Pikachu ex',
      ['Find on eBay', 'Find on Cardmarket', 'Find on TCGplayer', 'Remove from wishlist'],
      { destructive: [3] },
    );
    await waitFor(() =>
      expect(openURL).toHaveBeenCalledWith(
        'https://www.cardmarket.com/en/Pokemon/Products?idProduct=222',
      ),
    );
    openURL.mockRestore();
  });

  it('offers the same to VoiceOver', async () => {
    await render(withQueries(<Wishlist />));
    const row = await screen.findByRole('button', { name: /^Pikachu ex/ });
    expect(row.props.accessibilityActions.map((a: { label: string }) => a.label)).toEqual([
      'Find on eBay',
      'Find on Cardmarket',
      'Find on TCGplayer',
      'Remove',
    ]);
  });
});
