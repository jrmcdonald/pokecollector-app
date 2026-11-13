/**
 * The holo shimmer on a card's page: on from the setting Home read, for
 * official art only, and never a request of its own (the rate limit is
 * shared by everyone behind the tunnel).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import type { Card, CollectionItem } from '@/api/schemas';
import CardDetail from '@/app/card/[id]';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'sv1-025_en' }),
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));

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

const HOLO: Card = {
  id: 'sv1-025_en',
  name: 'Pikachu',
  number: '25',
  set_id: 'sv1',
  rarity: 'Rare Holo',
  images_large: 'https://assets.example.com/sv1/025/high.webp',
};
const copy = (variant: string): CollectionItem => ({
  id: 7,
  card_id: HOLO.id,
  quantity: 1,
  variant,
  condition: 'NM',
  card: HOLO,
});

let card: Card;
let collection: CollectionItem[];
let queryClient: QueryClient;

beforeEach(() => {
  card = HOLO;
  collection = [copy('Holo')];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  mockRequest.mockReset();
  mockRequest.mockImplementation(async (path: string) => {
    if (path === `/api/cards/${HOLO.id}`) return card;
    if (path === '/api/collection/') return collection;
    if (path === '/api/binders/' || path === '/api/decks/') return [];
    if (path === '/api/collection/printing-detail-tags' || path === '/api/wishlist/') return [];
    if (path.endsWith('/price-history')) return [];
    throw new Error(`Unexpected request: ${path}`);
  });
});
afterEach(() => queryClient.clear());

/** The setting as Home left it in the cache. */
const homeRead = (on: boolean) =>
  queryClient.setQueryData(['acct', 'setting', 'holo_effects_enabled'], on);

async function open() {
  await render(
    <QueryClientProvider client={queryClient}>
      <CardDetail />
    </QueryClientProvider>,
  );
  const art = await screen.findByTestId('holo-art', { includeHiddenElements: true });
  // Laid out, as on the phone, so the shimmer can size itself.
  await fireEvent(art, 'layout', { nativeEvent: { layout: { width: 200, height: 280 } } });
}

const shimmer = () => screen.queryByTestId('holo-shimmer', { includeHiddenElements: true });
const settingRequests = () =>
  mockRequest.mock.calls.filter(([path]) => String(path).startsWith('/api/settings'));

describe('Holo shimmer on a card’s page', () => {
  it('shows over a holo copy when the setting is on, without asking the server', async () => {
    homeRead(true);
    await open();
    expect(shimmer()).not.toBeNull();
    expect(settingRequests()).toHaveLength(0);
  });

  it('shows nothing when the setting is off or not read yet, and still does not ask', async () => {
    await open();
    expect(shimmer()).toBeNull();
    homeRead(false);
    await open();
    expect(shimmer()).toBeNull();
    expect(settingRequests()).toHaveLength(0);
  });

  it('shows nothing over a Normal copy', async () => {
    homeRead(true);
    collection = [copy('Normal')];
    await open();
    expect(shimmer()).toBeNull();
  });

  it('never shimmers over the owner’s own photo', async () => {
    homeRead(true);
    card = { ...HOLO, images_large: null };
    collection = [{ ...copy('Holo'), has_scan_photo: true }];
    await open();
    expect(shimmer()).toBeNull();
  });
});
