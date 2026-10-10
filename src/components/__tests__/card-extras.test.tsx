/**
 * The card page's price history and the decks the card is in, found the way
 * VoiceOver finds them: by role and accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { CardDecks } from '../card-decks';
import { PriceHistory } from '../price-history';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockRequest = jest.fn();
jest.mock('@/session/session', () => ({
  useSession: () => ({
    session: { status: 'signedIn', cacheId: 'acct' },
    getClient: () => ({ request: mockRequest }),
  }),
}));

/** `count` daily trend prices ending on 2026-10-10, from `start` up a euro a day. */
function daily(count: number, start = 10) {
  const end = Date.UTC(2026, 9, 10);
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    card_id: 'sv3pt5-006_en',
    date: new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    price_trend: start + i,
  }));
}

let queryClient: QueryClient;
beforeEach(() => {
  mockRequest.mockReset();
  mockPush.mockReset();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('PriceHistory', () => {
  it('shows the latest price and the change over three months', async () => {
    mockRequest.mockResolvedValue(daily(120));
    await render(withQueries(<PriceHistory cardId="sv3pt5-006_en" />));

    const figures = await screen.findByLabelText(/^€129\.00, \+€91\.00/);
    expect(figures).toBeTruthy();
    expect(screen.getByText(/over the past 3 months/)).toBeTruthy();
    expect(mockRequest).toHaveBeenCalledWith(
      '/api/cards/sv3pt5-006_en/price-history',
      expect.anything(),
    );
    // 120 days reach past three months, so a year shows more, but not past a year.
    expect(screen.getByRole('radio', { name: '1M, 1 of 3' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '3M, 2 of 3', selected: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '1Y, 3 of 3' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /^All/ })).toBeNull();
  });

  it('changes range', async () => {
    mockRequest.mockResolvedValue(daily(120));
    await render(withQueries(<PriceHistory cardId="sv3pt5-006_en" />));
    await userEvent.press(await screen.findByRole('radio', { name: '1M, 1 of 3' }));
    expect(screen.getByText(/\+€30\.00 \(\+30\.3%\) over the past month/)).toBeTruthy();
  });

  it('steps through the days with VoiceOver', async () => {
    mockRequest.mockResolvedValue(daily(24));
    await render(withQueries(<PriceHistory cardId="sv3pt5-006_en" />));
    const chart = await screen.findByRole('adjustable', {
      name: /^Trend price over the past month/,
    });
    expect(chart.props.accessibilityValue).toEqual({ text: '10 Oct 2026, €33.00' });

    await fireEvent(chart, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByLabelText('8 Oct 2026: €31.00')).toBeTruthy();
    await fireEvent(chart, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByLabelText(/^€33\.00, /)).toBeTruthy();
  });

  it('draws the line once it has a width, and scrubs to the day touched', async () => {
    mockRequest.mockResolvedValue(daily(24));
    await render(withQueries(<PriceHistory cardId="sv3pt5-006_en" />));
    const chart = await screen.findByRole('adjustable');
    await fireEvent(chart.parent!.parent!, 'layout', {
      nativeEvent: { layout: { width: 364, height: 180 } },
    });
    // 300 across the plot, the price labels taking the rest: day 0 is at the left edge.
    await fireEvent(chart, 'responderGrant', { nativeEvent: { locationX: 0 } });
    expect(screen.getByLabelText('17 Sept 2026: €10.00')).toBeTruthy();
    await fireEvent(chart, 'responderRelease');
    expect(screen.getByLabelText(/^€33\.00, /)).toBeTruthy();
  });

  it('says when there is nothing to draw yet', async () => {
    mockRequest.mockResolvedValue(daily(1));
    await render(withQueries(<PriceHistory cardId="sv3pt5-006_en" />));
    expect(await screen.findByText(/Only one price so far, €10\.00 on 10 Oct 2026/)).toBeTruthy();
  });

  it('offers to try again when it fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(daily(10));
    await render(withQueries(<PriceHistory cardId="sv3pt5-006_en" />));
    await userEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('adjustable')).toBeTruthy();
  });
});

describe('CardDecks', () => {
  beforeEach(() => {
    mockRequest.mockImplementation(async (path: string) => {
      if (path === '/api/decks/')
        return [
          { id: 3, name: 'Lost Box', binder_type: 'deck', updated_at: '2026-10-01' },
          { id: 4, name: 'Battle Deck', binder_type: 'physical_deck', updated_at: '2026-10-02' },
        ];
      if (path === '/api/decks/3')
        return {
          id: 3,
          name: 'Lost Box',
          binder_type: 'deck',
          entries: [{ id: 1, card_id: 'sv3pt5-006_en', required_quantity: 2 }],
        };
      if (path === '/api/decks/4')
        return {
          id: 4,
          name: 'Battle Deck',
          binder_type: 'physical_deck',
          entries: [{ id: 2, card_id: 'other', required_quantity: 1 }],
        };
      throw new Error(`Unexpected ${path}`);
    });
  });

  it('lists the decks the card is in, and opens one', async () => {
    await render(withQueries(<CardDecks cardId="sv3pt5-006_en" />));
    expect(await screen.findByRole('header', { name: 'In 1 deck' })).toBeTruthy();
    await userEvent.press(screen.getByRole('button', { name: 'Lost Box, Planned · 2 copies' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/deck/[id]',
      params: { id: '3', name: 'Lost Box' },
    });
    expect(screen.queryByRole('button', { name: /Battle Deck/ })).toBeNull();
  });

  it('shows nothing for a card in no deck', async () => {
    // Decks already read, and fresh: nothing is fetched.
    queryClient.setQueryData(
      ['acct', 'deck-contents'],
      [{ id: 3, name: 'Lost Box', binder_type: 'deck', cards: { 'sv3pt5-006_en': 2 } }],
    );
    await render(withQueries(<CardDecks cardId="nowhere" />));
    expect(screen.toJSON()).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
