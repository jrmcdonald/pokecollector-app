/**
 * The catalogue search's filters and the search inside a set, found the way
 * VoiceOver finds them: by role and accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ChecklistCard, SearchCard } from '@/api/schemas';
import Search from '@/app/(tabs)/search';
import SetChecklist from '@/app/set/[id]';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));

const mockPick = jest.fn();
jest.mock('@/utils/pick', () => ({ pick: (...args: unknown[]) => mockPick(...args) }));

const mockRequest = jest.fn();
jest.mock('@/session/session', () => ({
  useSession: () => ({
    session: {
      status: 'signedIn',
      cacheId: 'acct',
      client: { activeBaseUrl: 'https://pc.example.com', proxyHeaders: {}, sessionToken: 't' },
    },
    getClient: () => ({ request: mockRequest }),
  }),
}));

const card = (id: string, name: string, rarity: string): SearchCard => ({
  id,
  name,
  rarity,
  number: id.split('-')[1],
  set_ref: { id: 'sv03.5_en', name: '151', abbreviation: 'MEW' },
});

const SEARCH_RESULTS = [
  card('sv03.5-006', 'Charizard ex', 'Double rare'),
  card('sv03.5-183', 'Charizard ex', 'Ultra Rare'),
  card('sv03.5-004', 'Charmander', 'Common'),
];

const CHECKLIST: ChecklistCard[] = [
  { id: 'sv03.5-001', name: 'Bulbasaur', number: '001', rarity: 'Common', owned_quantity: 1 },
  { id: 'sv03.5-002', name: 'Ivysaur', number: '002', rarity: 'Uncommon' },
  { id: 'sv03.5-003', name: 'Venusaur ex', number: '003', rarity: 'Double rare' },
  { id: 'sv03.5-004', name: 'Charmander', number: '004', rarity: 'Common' },
];

type Options = { query?: Record<string, unknown> };
const searches = () =>
  mockRequest.mock.calls
    .filter(([path]) => path === '/api/cards/search')
    .map(([, options]: [string, Options]) => options.query);

let queryClient: QueryClient;
beforeEach(() => {
  mockParams = {};
  mockPick.mockReset();
  mockRequest.mockReset();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  mockRequest.mockImplementation(async (path: string, options: Options = {}) => {
    if (path === '/api/cards/search') {
      const rarity = options.query?.rarity as string | undefined;
      // Upstream's substring match: "rare" finds Double and Ultra.
      const data = rarity
        ? SEARCH_RESULTS.filter((c) => c.rarity!.toLowerCase().includes(rarity.toLowerCase()))
        : SEARCH_RESULTS;
      return { data, total_count: data.length, page: 1, page_size: 30 };
    }
    if (path === '/api/sets/')
      return [
        { id: 'sv03.5_en', name: '151', abbreviation: 'MEW', series: 'Scarlet & Violet' },
        { id: 'sv03_en', name: 'Obsidian Flames', abbreviation: 'OBF', series: 'Scarlet & Violet' },
      ];
    if (path === '/api/sets/sv03.5_en/checklist')
      return {
        set: { id: 'sv03.5_en', name: '151', total: 4 },
        cards: CHECKLIST,
        owned_count: 1,
        total_count: 4,
      };
    throw new Error(`Unexpected ${path}`);
  });
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('Search filters', () => {
  it('searches on a filter alone, and keeps only that exact rarity', async () => {
    await render(withQueries(<Search />));
    expect(searches()).toEqual([]);

    mockPick.mockResolvedValueOnce(5); // All, Common, Uncommon, Rare, Holo Rare, Double rare
    await userEvent.press(screen.getByRole('button', { name: 'Rarity: all' }));

    expect(await screen.findByRole('button', { name: 'Rarity: Double Rare' })).toBeTruthy();
    await waitFor(() =>
      expect(searches()).toEqual([expect.objectContaining({ rarity: 'Double rare' })]),
    );
    expect(await screen.findByRole('button', { name: /^Charizard ex, MEW 006/ })).toBeTruthy();
    expect(screen.getByText('1 card')).toBeTruthy();
  });

  it('drops near misses from upstream’s substring match', async () => {
    await render(withQueries(<Search />));
    mockPick.mockResolvedValueOnce(3); // Rare
    await userEvent.press(screen.getByRole('button', { name: 'Rarity: all' }));
    // Upstream finds Double rare and Ultra Rare for "Rare"; neither is a Rare.
    expect(await screen.findByText('No cards found')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Charizard ex/ })).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: 'Rarity: all' })).toBeTruthy();
  });

  it('fetches on by itself when a page was all near misses', async () => {
    const uncommon = Array.from({ length: 60 }, (_, i) =>
      card(`sv03.5-${100 + i}`, `Uncommon ${i}`, 'Uncommon'),
    );
    mockRequest.mockImplementation(async (path: string, options: Options = {}) => {
      if (path !== '/api/cards/search') throw new Error(`Unexpected ${path}`);
      const page = options.query?.page as number;
      // "Common" finds Uncommon too: a whole first page of them.
      const data = page === 1 ? uncommon : [card('sv03.5-004', 'Charmander', 'Common')];
      return { data, total_count: 61, page, page_size: 60 };
    });
    await render(withQueries(<Search />));
    mockPick.mockResolvedValueOnce(1); // Common
    await userEvent.press(screen.getByRole('button', { name: 'Rarity: all' }));

    expect(await screen.findByRole('button', { name: /^Charmander, MEW 004/ })).toBeTruthy();
    expect(searches().map((q) => [q?.page, q?.page_size])).toEqual([
      [1, 60],
      [2, 60],
    ]);
    expect(screen.queryByRole('button', { name: /^Uncommon/ })).not.toBeOnTheScreen();
    expect(screen.getByText('1 card')).toBeTruthy();
  });

  it('picks a set from a searchable sheet and sends its id', async () => {
    await render(withQueries(<Search />));
    await userEvent.press(screen.getByRole('button', { name: 'Set: all' }));
    expect(await screen.findByRole('button', { name: 'Any set', selected: true })).toBeTruthy();

    await userEvent.type(screen.getByLabelText('Search sets'), 'obsidian');
    expect(screen.queryByRole('button', { name: /^151/ })).not.toBeOnTheScreen();
    await userEvent.clear(screen.getByLabelText('Search sets'));
    await userEvent.press(screen.getByRole('button', { name: '151, MEW · Scarlet & Violet' }));

    expect(await screen.findByRole('button', { name: 'Set: 151' })).toBeTruthy();
    await waitFor(() =>
      expect(searches()).toEqual([expect.objectContaining({ set_id: 'sv03.5_en' })]),
    );
  });

  it('offers a type only for Pokémon', async () => {
    await render(withQueries(<Search />));
    expect(screen.getByRole('button', { name: 'Type: all' })).toBeTruthy();

    mockPick.mockResolvedValueOnce(2); // All, Pokémon, Trainer
    await userEvent.press(screen.getByRole('button', { name: 'Category: all' }));
    expect(await screen.findByRole('button', { name: 'Category: Trainer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Type/ })).not.toBeOnTheScreen();
    await waitFor(() =>
      expect(searches()).toEqual([
        expect.objectContaining({ category: 'Trainer', type: undefined }),
      ]),
    );
  });
});

describe('Searching a set', () => {
  beforeEach(() => {
    mockParams = { id: 'sv03.5_en', name: '151' };
  });

  it('finds cards by name or number, with what to show', async () => {
    await render(withQueries(<SetChecklist />));
    const field = await screen.findByLabelText('Search this set');

    await userEvent.type(field, 'saur');
    expect(screen.getByRole('button', { name: /^Bulbasaur/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Venusaur ex/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Charmander/ })).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole('radio', { name: 'Missing, 2 of 3' }));
    expect(screen.queryByRole('button', { name: /^Bulbasaur/ })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Ivysaur/ })).toBeTruthy();

    await userEvent.clear(field);
    await userEvent.press(screen.getByRole('radio', { name: 'All, 1 of 3' }));
    await userEvent.type(field, '4');
    expect(screen.getByRole('button', { name: /^Charmander/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Bulbasaur/ })).not.toBeOnTheScreen();
    // All of it on the phone: one request, for the checklist.
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('shows only what a narrower search finds, with nothing left from before', async () => {
    await render(withQueries(<SetChecklist />));
    const field = await screen.findByLabelText('Search this set');
    const tiles = () =>
      screen.queryAllByRole('button', { name: /^(Bulbasaur|Ivysaur|Venusaur|Charmander)/ });

    // "v" finds Ivysaur and Venusaur ex; "ve", Venusaur ex alone.
    await userEvent.type(field, 'v');
    expect(tiles()).toHaveLength(2);
    await userEvent.type(field, 'e');
    expect(tiles().map((tile) => tile.props.accessibilityLabel)).toEqual([
      expect.stringMatching(/^Venusaur ex/),
    ]);
  });

  it('filters by the set’s own rarities, and says when nothing matches', async () => {
    await render(withQueries(<SetChecklist />));
    mockPick.mockResolvedValueOnce(3); // All, Common, Uncommon, Double rare
    await userEvent.press(await screen.findByRole('button', { name: 'Rarity: all' }));
    expect(mockPick).toHaveBeenCalledWith('Rarity', [
      'All',
      'Common (2)',
      'Uncommon (1)',
      'Double Rare (1)',
    ]);
    expect(await screen.findByRole('button', { name: /^Venusaur ex/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Bulbasaur/ })).not.toBeOnTheScreen();

    await userEvent.type(screen.getByLabelText('Search this set'), 'pikachu');
    expect(screen.getByText('No matches')).toBeTruthy();
    await userEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: /^Bulbasaur/ })).toBeTruthy();
    expect(screen.getByLabelText('Search this set')).toHaveDisplayValue('');
    expect(screen.getByRole('button', { name: 'Rarity: all' })).toBeTruthy();
  });
});
