/**
 * Adding a prebuilt deck, found the way VoiceOver finds it: by role and
 * accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { Deck } from '@/api/schemas';
import DeckImport from '@/app/deck-import';

import { DeckEntryRow } from '../deck-entry-row';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    back: jest.fn(),
  },
  Stack: { Screen: () => null },
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    create() {}
    write() {}
  },
}));

const DECK: Deck = {
  id: 9,
  name: 'Pikachu ex Battle Deck',
  binder_type: 'deck',
  missing_copy_count: 4,
  entries: [
    {
      id: 1,
      card_id: 'sv01-057_en',
      required_quantity: 4,
      shortage: 4,
      card: {
        id: 'sv01-057_en',
        name: 'Pikachu ex',
        number: '57',
        set_ref: { id: 'sv01_en', name: 'Scarlet & Violet', abbreviation: 'SVI' },
      },
    },
  ],
};

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

let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient({
    // No garbage-collection timers: one left running after the screen unmounts
    // keeps Jest from exiting.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  mockRequest.mockImplementation(async (path: string, options: { method?: string } = {}) => {
    if (path === '/api/decks/' && options.method === 'POST') return { id: 9, name: DECK.name };
    if (path.endsWith('/import-csv')) return { added: 1, failed: 0, errors: [] };
    if (path === '/api/decks/9') return DECK;
    if (path === '/api/sets/') return [];
    throw new Error(`Unexpected ${path}`);
  });
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('DeckEntryRow', () => {
  it('names the card, its code, the copies and what is missing', async () => {
    await render(<DeckEntryRow deck={DECK} entry={DECK.entries![0]!} />);
    await userEvent.press(
      screen.getByRole('button', { name: 'Pikachu ex, SVI 57, 4 copies, 4 missing' }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/card/[id]',
      params: { id: 'sv01-057_en' },
    });
  });

  it('says nothing is missing from a Real Deck', async () => {
    await render(
      <DeckEntryRow deck={{ binder_type: 'physical_deck' }} entry={DECK.entries![0]!} />,
    );
    expect(screen.getByRole('button', { name: 'Pikachu ex, SVI 57, 4 copies' })).toBeTruthy();
  });
});

describe('DeckImport', () => {
  it('needs a name and a list before it looks anything up', async () => {
    await render(withQueries(<DeckImport />));
    const lookUp = screen.getByRole('button', { name: 'Look up the cards' });
    expect(lookUp).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Deck name'), 'Pikachu ex Battle Deck');
    await userEvent.type(screen.getByLabelText('Deck list'), '4 Pikachu ex SVI 57\n2 Nest Ball');
    expect(screen.getByText('6 cards on 2 lines')).toBeTruthy();
    expect(lookUp).toBeEnabled();
  });

  it('shows what was found and what was not, then adds it all', async () => {
    await render(withQueries(<DeckImport />));
    await userEvent.type(screen.getByLabelText('Deck name'), 'Pikachu ex Battle Deck');
    await userEvent.type(screen.getByLabelText('Deck list'), '4 Pikachu ex SVI 57\n2 Nest Ball');
    await userEvent.press(screen.getByRole('button', { name: 'Look up the cards' }));

    expect(await screen.findByText('4 cards found')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Nest Ball, Line 2 · no set given · 2 copies' }),
    ).toBeTruthy();

    mockRequest.mockImplementation(async (path: string) => {
      if (path === '/api/collection/bulk-add') return { added: 1, updated: 0, failed: 0 };
      if (path.startsWith('/api/decks/9')) return { ...DECK, binder_type: 'physical_deck' };
      return [];
    });
    await userEvent.press(screen.getByRole('button', { name: 'Add 4 cards to the collection' }));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/deck/[id]',
        params: { id: '9', name: DECK.name },
      }),
    );
    expect(mockRequest).toHaveBeenCalledWith(
      '/api/collection/bulk-add',
      expect.objectContaining({
        json: {
          items: [
            {
              card_id: 'sv01-057_en',
              quantity: 4,
              variant: 'Normal',
              condition: 'NM',
              lang: 'en',
            },
          ],
        },
      }),
    );
  });
});
