/**
 * Choosing cards and removing them together (upstream 1.57.0, #456), and
 * the conflict sheet that frees what blocks a removal, found the way
 * VoiceOver finds them: by role and accessible name. Upstream's 409s are its
 * own answers (`removal-fixtures.ts`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import { assigned, assignmentsChanged, productLinked } from '@/api/__tests__/removal-fixtures';
import { ConflictError, NotFoundError } from '@/api/errors';
import type { BinderCards, CollectionItem, Deck } from '@/api/schemas';
import BinderDetail from '@/app/binder/[id]';
import CardDetail from '@/app/card/[id]';
import Collection from '@/app/collection';
import DeckDetail from '@/app/deck/[id]';
import { RemovalConflictSheet } from '@/components/removal-conflict-sheet';
import { closeRemovalConflict } from '@/utils/removal-conflict';

type HeaderItem = { label: string; accessibilityLabel?: string; onPress(): void };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { Pressable: P, Text: T } = jest.requireActual('react-native');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => true,
    Stack: {
      Screen: ({ options }: { options: { unstable_headerRightItems?: () => HeaderItem[] } }) =>
        (options.unstable_headerRightItems?.() ?? []).map((item: HeaderItem) => (
          <P
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.accessibilityLabel ?? item.label}
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

/** Presses the alert's destructive button, as a person confirming would. */
const alerts: { title: string; message?: string }[] = [];
beforeAll(() => {
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    alerts.push({ title, message });
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });
});

const item = (id: number, name: string, quantity = 1): CollectionItem => ({
  id,
  card_id: `card-${id}_en`,
  quantity,
  condition: 'NM',
  variant: 'Normal',
  card: { id: `card-${id}_en`, name, number: String(id) },
});
const COLLECTION = [item(1, 'First card', 3), item(2, 'Second card', 2), item(3, 'Third card')];

let queryClient: QueryClient;
let handle: (path: string, options?: { json?: unknown }) => unknown;

beforeEach(() => {
  jest.clearAllMocks();
  alerts.length = 0;
  closeRemovalConflict();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  handle = () => ({ removed_ids: [], removed_entries: 0, removed_copies: 0 });
  mockRequest.mockImplementation(async (path: string, options?: { json?: unknown }) => {
    if (path === '/api/collection/') return COLLECTION;
    if (path === '/api/binders/' || path === '/api/decks/') return [];
    return handle(path, options);
  });
});
afterEach(() => queryClient.clear());

const show = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      {ui}
      <RemovalConflictSheet />
    </QueryClientProvider>,
  );

const posts = (path: string) =>
  mockRequest.mock.calls.filter(([p, o]) => p === path && o?.method === 'POST');

async function chooseOnCollection(names: string[]) {
  const user = userEvent.setup();
  await show(<Collection />);
  await user.press(await screen.findByRole('button', { name: 'Choose cards to remove' }));
  for (const name of names) {
    await user.press(screen.getByRole('checkbox', { name: new RegExp(`^${name}`) }));
  }
  return user;
}

describe('choosing cards on Collection', () => {
  it('removes the chosen entries in one request, after asking', async () => {
    const user = await chooseOnCollection(['First card', 'Second card']);
    expect(screen.getByRole('checkbox', { name: /^First card/, checked: true })).toBeOnTheScreen();
    expect(screen.getByText('2 chosen · 5 copies')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove' }));
    expect(alerts[0]).toEqual({
      title: 'Remove from your collection?',
      message:
        '2 entries, 5 copies in all, will be removed. Every copy in each goes. This can’t be undone.',
    });
    await waitFor(() => expect(posts('/api/collection/bulk-delete')).toHaveLength(1));
    expect(posts('/api/collection/bulk-delete')[0]?.[1]).toMatchObject({
      json: { item_ids: [1, 2] },
    });
    // Done: back to the plain grid.
    await screen.findByRole('button', { name: 'Choose cards to remove' });
  });

  it('frees copies held in a binder and a deck, then removes again, each step confirmed', async () => {
    let refused = false;
    handle = (path) => {
      if (path === '/api/collection/bulk-delete' && !refused) {
        refused = true;
        throw new ConflictError('x', 409, assigned.detail);
      }
      return {};
    };
    const user = await chooseOnCollection(['First card']);
    await user.press(screen.getByRole('button', { name: 'Remove' }));

    expect(
      await screen.findByRole('header', { name: 'Still in binders or decks' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('In the binder Physical binder · 1 copy')).toBeOnTheScreen();
    expect(screen.getByText('In the Real Deck Real deck · 2 copies')).toBeOnTheScreen();
    const removeAgain = screen.getByRole('button', { name: 'Remove from collection' });
    expect(removeAgain).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'Take out of binders and decks' }));
    expect(alerts.at(-1)?.title).toBe('Take these copies out of their binders and decks?');
    await waitFor(() => expect(posts('/api/collection/release-assignments')).toHaveLength(1));
    // Exactly what upstream reported, so it can tell if anything moved since.
    expect(posts('/api/collection/release-assignments')[0]?.[1]).toMatchObject({
      json: assigned.detail.resolutions[0]?.body,
    });
    await screen.findByText(/Nothing has been removed from your collection yet/);

    await user.press(screen.getByRole('button', { name: 'Remove from collection' }));
    await waitFor(() => expect(posts('/api/collection/bulk-delete')).toHaveLength(2));
    await waitFor(() =>
      expect(screen.queryByRole('header', { name: 'Still in binders or decks' })).toBeNull(),
    );
  });

  it('shows the refreshed list when the assignments changed meanwhile', async () => {
    handle = (path) => {
      if (path === '/api/collection/bulk-delete')
        throw new ConflictError('x', 409, assigned.detail);
      if (path === '/api/collection/release-assignments')
        throw new ConflictError('x', 409, assignmentsChanged.detail);
      return {};
    };
    const user = await chooseOnCollection(['First card']);
    await user.press(screen.getByRole('button', { name: 'Remove' }));
    await user.press(await screen.findByRole('button', { name: 'Take out of binders and decks' }));
    expect(
      await screen.findByText(
        'These changed since you looked. Check the list below and confirm again.',
      ),
    ).toBeOnTheScreen();
    // To confirm again, not freed.
    expect(screen.getByRole('button', { name: 'Take out of binders and decks' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove from collection' })).toBeDisabled();
  });

  it('unlinks products only where upstream allows it', async () => {
    handle = (path) => {
      if (path === '/api/collection/bulk-delete')
        throw new ConflictError('x', 409, productLinked.detail);
      return {};
    };
    const user = await chooseOnCollection(['Second card']);
    await user.press(screen.getByRole('button', { name: 'Remove' }));
    expect(
      await screen.findByRole('header', { name: 'Linked to a sealed product' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('From Test product · 1 copy')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Unlink from products' }));
    await waitFor(() => expect(posts('/api/products/cards/bulk-unlink')).toHaveLength(1));
    expect(posts('/api/products/cards/bulk-unlink')[0]?.[1]).toMatchObject({
      json: productLinked.detail.resolutions[0]?.body,
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove from collection' })).toBeEnabled(),
    );
  });

  it('offers no unlink when a link has sale history', async () => {
    const protectedDetail = {
      ...productLinked.detail,
      resolutions: productLinked.detail.resolutions.map((r) => ({ ...r, can_execute: false })),
    };
    handle = (path) => {
      if (path === '/api/collection/bulk-delete')
        throw new ConflictError('x', 409, protectedDetail);
      return {};
    };
    const user = await chooseOnCollection(['Second card']);
    await user.press(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText(/can’t be undone here/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Unlink from products' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove from collection' })).toBeDisabled();
  });

  it('hides Select on a server before 1.57.0, after its 404', async () => {
    handle = (path) => {
      if (path === '/api/collection/bulk-delete') throw new NotFoundError('Not Found', 404);
      return {};
    };
    const user = await chooseOnCollection(['Third card']);
    await user.press(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(alerts.at(-1)?.title).toBe('Not on this server yet'));
    // Choosing ends with the 404, and Select stays away (for a day).
    await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Choose cards to remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('choosing cards in a binder and a deck', () => {
  it('takes binder entries out, leaving the collection', async () => {
    mockParams = { id: '4' };
    const binder: BinderCards = {
      binder: { id: 4, name: 'Trade binder', binder_type: 'collection', card_count: 2 },
      cards: [
        { id: 'card-1_en', binder_card_id: 11, name: 'First card', collection_item_id: 1 },
        { id: 'card-2_en', binder_card_id: 12, name: 'Second card', collection_item_id: 2 },
      ],
    };
    handle = (path) => (path === '/api/binders/4/cards' ? binder : {});
    const user = userEvent.setup();
    await show(<BinderDetail />);
    await user.press(await screen.findByRole('button', { name: 'Choose cards to take out' }));
    await user.press(screen.getByRole('checkbox', { name: /^Second card/ }));
    await user.press(screen.getByRole('button', { name: 'Take out' }));
    expect(alerts[0]?.title).toBe('Take out of this binder?');
    await waitFor(() => expect(posts('/api/binders/4/entries/bulk-delete')).toHaveLength(1));
    expect(posts('/api/binders/4/entries/bulk-delete')[0]?.[1]).toMatchObject({
      json: { item_ids: [12] },
    });
  });

  it('takes deck cards out', async () => {
    mockParams = { id: '9' };
    const deck: Deck = {
      id: 9,
      name: 'Lost Box',
      binder_type: 'deck',
      entries: [
        {
          id: 21,
          card_id: 'card-1_en',
          required_quantity: 2,
          card: { id: 'card-1_en', name: 'First card' },
        },
        {
          id: 22,
          card_id: 'card-2_en',
          required_quantity: 4,
          card: { id: 'card-2_en', name: 'Second card' },
        },
      ],
    };
    handle = (path) => (path === '/api/decks/9' ? deck : {});
    const user = userEvent.setup();
    await show(<DeckDetail />);
    await user.press(await screen.findByRole('button', { name: 'Choose cards to take out' }));
    await user.press(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 chosen · 6 copies')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take out' }));
    expect(alerts[0]?.message).toBe(
      '2 entries, 6 copies in all, will come out of this deck. Your collection doesn’t change.',
    );
    await waitFor(() => expect(posts('/api/decks/9/entries/bulk-delete')).toHaveLength(1));
  });
});

describe("a single copy taken to 0 on a card's page", () => {
  it('opens the same sheet when upstream refuses, and removes that copy once freed', async () => {
    mockParams = { id: 'card-1_en' };
    let refused = false;
    handle = (path) => {
      if (path === '/api/cards/card-1_en') return COLLECTION[0]?.card;
      if (path === '/api/collection/1' && !refused) {
        refused = true;
        throw new ConflictError('x', 409, assigned.detail);
      }
      if (path.endsWith('/price-history') || path === '/api/wishlist/') return [];
      if (path === '/api/collection/printing-detail-tags') return [];
      return {};
    };
    const single = [{ ...item(1, 'First card', 1) }];
    mockRequest.mockImplementation(async (path: string, options?: { json?: unknown }) => {
      if (path === '/api/collection/') return single;
      if (path === '/api/binders/' || path === '/api/decks/') return [];
      return handle(path, options);
    });
    const user = userEvent.setup();
    await show(<CardDetail />);
    await user.press(await screen.findByRole('button', { name: 'Remove one of Normal NM' }));
    expect(
      await screen.findByRole('header', { name: 'Still in binders or decks' }),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Take out of binders and decks' }));
    await user.press(await screen.findByRole('button', { name: 'Remove from collection' }));
    await waitFor(() =>
      expect(
        mockRequest.mock.calls.filter(
          ([p, o]) => p === '/api/collection/1' && o?.method === 'DELETE',
        ),
      ).toHaveLength(2),
    );
  });
});
