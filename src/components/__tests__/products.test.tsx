/**
 * Sealed products: the list, a product's page and the add and edit form,
 * found the way VoiceOver finds them: by role and accessible name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import type { Product } from '@/api/schemas';
import ProductDetail from '@/app/product/[id]';
import ProductEdit from '@/app/product-edit';
import Products from '@/app/products';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
type HeaderItem = { label: string; accessibilityLabel: string; onPress(): void };
jest.mock('expo-router', () => {
  const { Pressable: P, Text: T } = jest.requireActual('react-native');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
    useLocalSearchParams: () => mockParams,
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

const BOX: Product = {
  id: 7,
  product_name: 'Surging Sparks Booster Box',
  product_type: 'Booster Box',
  purchase_price: 160,
  purchase_date: '2026-10-01',
  lifecycle_status: 'sealed',
  current_value: 190,
  computed_current_value: 190,
  value_source: 'manual_current',
  pnl: 30,
  pnl_percent: 18.75,
};

const TIN: Product = {
  id: 8,
  product_name: 'Charizard ex Tin',
  product_type: 'Tin',
  purchase_price: 25,
  purchase_date: '2026-09-12',
  lifecycle_status: 'opened',
  computed_current_value: 0,
  value_source: 'opened_unlinked',
};

let queryClient: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  queryClient.setQueryData(['acct', 'products'], [TIN, BOX]);
  mockRequest.mockRejectedValue(new Error('Offline in tests'));
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('Products', () => {
  it('reads the totals and every product, newest first', async () => {
    await render(withQueries(<Products />));
    // 185 invested; the opened tin counts nothing until its pulls are linked.
    expect(screen.getByLabelText('Profit or loss: +€5.00 (+2.7%)')).toBeOnTheScreen();
    expect(screen.getByLabelText('Invested: €185.00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Value: €190.00')).toBeOnTheScreen();
    const rows = screen.getAllByRole('button', { name: /Booster Box|Tin/ });
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Surging Sparks Booster Box, Booster Box · Sealed · 1 Oct 2026, paid €160.00, profit or loss +€30.00',
      'Charizard ex Tin, Tin · Opened · 12 Sept 2026, paid €25.00',
    ]);
  });

  it('opens a product, and adds one', async () => {
    await render(withQueries(<Products />));
    await userEvent.press(screen.getByRole('button', { name: /^Charizard ex Tin/ }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/product/[id]',
      params: { id: '8', name: 'Charizard ex Tin' },
    });
    // The header's Add, and the same at the foot of the list.
    const [headerAdd] = screen.getAllByRole('button', { name: 'Add a product' });
    await userEvent.press(headerAdd!);
    expect(mockPush).toHaveBeenCalledWith('/product-edit');
  });

  it('says how to start when there are none', async () => {
    queryClient.setQueryData(['acct', 'products'], []);
    await render(withQueries(<Products />));
    expect(screen.getByText('No sealed products yet')).toBeOnTheScreen();
  });
});

describe('ProductDetail', () => {
  it('reads its value, where it comes from, and what it cost', async () => {
    mockParams = { id: '7' };
    await render(withQueries(<ProductDetail />));
    expect(
      screen.getByLabelText('Value: €190.00, profit or loss: +€30.00 (+18.8%)'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Paid: €160.00')).toBeOnTheScreen();
    expect(screen.getByText('The value you entered. In euros.')).toBeOnTheScreen();
  });

  it('marks it opened once confirmed', async () => {
    mockParams = { id: '7' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Mark opened')?.onPress?.();
    });
    mockRequest.mockResolvedValueOnce({ ...BOX, lifecycle_status: 'opened' });
    await render(withQueries(<ProductDetail />));
    await userEvent.press(screen.getByRole('button', { name: 'Mark opened' }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith(
        '/api/products/7',
        expect.objectContaining({ method: 'PUT', json: { lifecycle_status: 'opened' } }),
      ),
    );
    alert.mockRestore();
  });

  it('deletes it once confirmed', async () => {
    mockParams = { id: '7' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Delete')?.onPress?.();
    });
    mockRequest.mockResolvedValueOnce({ message: 'Product deleted' });
    await render(withQueries(<ProductDetail />));
    await userEvent.press(screen.getByRole('button', { name: 'Delete product' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockRequest).toHaveBeenCalledWith('/api/products/7', { method: 'DELETE' });
    alert.mockRestore();
  });

  it('cannot delete one with pulls, as upstream keeps their history', async () => {
    mockParams = { id: '8' };
    queryClient.setQueryData(
      ['acct', 'products'],
      [{ ...TIN, value_source: 'linked_cards', linked_cards_count: 11, linked_live_value: 32.5 }],
    );
    await render(withQueries(<ProductDetail />));
    expect(screen.getByLabelText('Cards: 11')).toBeOnTheScreen();
    expect(screen.getByLabelText('Worth now: €32.50')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Delete product' })).toBeNull();
  });

  it('asks which state one in review is in', async () => {
    mockParams = { id: '7' };
    queryClient.setQueryData(
      ['acct', 'products'],
      [{ ...BOX, lifecycle_status: 'review', value_source: 'needs_review', pnl: null }],
    );
    mockRequest.mockResolvedValueOnce({ ...BOX });
    await render(withQueries(<ProductDetail />));
    await userEvent.press(screen.getByRole('button', { name: 'Still sealed' }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith(
        '/api/products/7',
        expect.objectContaining({ method: 'PUT', json: { lifecycle_status: 'sealed' } }),
      ),
    );
  });
});

describe('ProductEdit', () => {
  it('says what is missing before sending anything', async () => {
    await render(withQueries(<ProductEdit />));
    await userEvent.press(screen.getByRole('button', { name: 'Add product' }));
    expect(screen.getByLabelText('Name')).toHaveProp('accessibilityHint', 'Enter a name.');
    expect(screen.getByLabelText('Price paid')).toHaveProp(
      'accessibilityHint',
      'Enter what you paid, like 59.99.',
    );
    expect(mockRequest).not.toHaveBeenCalledWith('/api/products/', expect.anything());
  });

  it('adds several identical ones in one request', async () => {
    mockRequest.mockImplementation(async (path: string) => {
      if (path === '/api/products/batch')
        return [
          { ...BOX, id: 20 },
          { ...BOX, id: 21 },
        ];
      throw new Error(`Unexpected ${path}`);
    });
    await render(withQueries(<ProductEdit />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Surging Sparks Booster Box');
    await user.press(screen.getByRole('radio', { name: 'Booster Box' }));
    await user.type(screen.getByLabelText('Price paid'), '160');
    await user.press(screen.getByRole('button', { name: 'Increase How many' }));
    expect(screen.getByText('€320.00 in all. Each is its own product.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add 2 products' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockRequest).toHaveBeenCalledWith(
      '/api/products/batch',
      expect.objectContaining({
        method: 'POST',
        json: expect.objectContaining({
          product_name: 'Surging Sparks Booster Box',
          product_type: 'Booster Box',
          purchase_price: 160,
          lifecycle_status: 'sealed',
          quantity: 2,
        }),
      }),
    );
  });

  it('edits a product, recording its sale', async () => {
    mockParams = { id: '7' };
    mockRequest.mockImplementation(async (path: string) => {
      if (path === '/api/products/7') return { ...BOX, lifecycle_status: 'sold', sold_price: 210 };
      throw new Error(`Unexpected ${path}`);
    });
    await render(withQueries(<ProductEdit />));
    const user = userEvent.setup();
    expect(screen.getByLabelText('Name')).toHaveProp('value', 'Surging Sparks Booster Box');
    await user.type(screen.getByLabelText('Sold for (optional)'), '210');
    await user.type(screen.getByLabelText('Sold on'), '2026-10-05');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockRequest).toHaveBeenCalledWith(
      '/api/products/7',
      expect.objectContaining({
        method: 'PUT',
        json: expect.objectContaining({ sold_price: 210, sold_date: '2026-10-05' }),
      }),
    );
  });
});
