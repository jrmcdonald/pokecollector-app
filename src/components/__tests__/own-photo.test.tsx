/**
 * The owner's own photo of a card the catalogue has no picture of, on the
 * card's screen, found the way VoiceOver finds it: by role and name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import type { Card, CollectionItem } from '@/api/schemas';
import CardDetail from '@/app/card/[id]';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'mcd21-25_en' }),
  Stack: { Screen: () => null },
}));

const mockPick = jest.fn();
jest.mock('@/utils/pick', () => ({ pick: (...args: unknown[]) => mockPick(...args) }));

const mockTakePhoto = jest.fn();
jest.mock('@/utils/card-photo', () => ({
  ...jest.requireActual('@/utils/card-photo'),
  takeCardPhoto: (...args: unknown[]) => mockTakePhoto(...args),
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

const NO_PICTURE: Card = { id: 'mcd21-25_en', name: 'Pikachu', number: '25', set_id: 'mcd21' };
const copy = (extra: Partial<CollectionItem> = {}): CollectionItem => ({
  id: 7,
  card_id: 'mcd21-25_en',
  quantity: 1,
  variant: 'Normal',
  condition: 'NM',
  card: NO_PICTURE,
  ...extra,
});

let card: Card;
let collection: CollectionItem[];
let queryClient: QueryClient;
beforeEach(() => {
  card = NO_PICTURE;
  collection = [copy()];
  mockPick.mockReset();
  mockTakePhoto.mockReset();
  mockRequest.mockReset();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  mockRequest.mockImplementation(async (path: string, options: { method?: string } = {}) => {
    if (path === '/api/cards/mcd21-25_en') return card;
    if (path === '/api/collection/' && !options.method) return collection;
    if (path === '/api/collection/7/photo') return { collection_item_id: 7 };
    if (path === '/api/dashboard/') return {};
    if (path === '/api/binders/') return [];
    if (path === '/api/collection/printing-detail-tags') return [];
    if (path === '/api/wishlist/') return [];
    throw new Error(`Unexpected ${options.method ?? 'GET'} ${path}`);
  });
});
afterEach(() => queryClient.clear());

function withQueries(ui: ReactNode) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

const photoRequests = () =>
  mockRequest.mock.calls.filter(([path]) => path === '/api/collection/7/photo');

describe('Own photo', () => {
  it('uploads a photo of the copy, chosen from the library', async () => {
    const file = new Blob(['jpeg']);
    mockTakePhoto.mockResolvedValueOnce(file);
    mockPick.mockResolvedValueOnce(1); // Choose from library
    await render(withQueries(<CardDetail />));

    await userEvent.press(await screen.findByRole('button', { name: 'Add a photo of your copy' }));
    expect(mockPick).toHaveBeenCalledWith(
      'Your photo of this card',
      ['Take a photo', 'Choose from library'],
      { destructive: [] },
    );
    expect(mockTakePhoto).toHaveBeenCalledWith('library');
    await waitFor(() => expect(photoRequests()).toHaveLength(1));
    const [, options] = photoRequests()[0] as [string, { method: string; form: FormData }];
    expect(options.method).toBe('POST');
    expect(options.form.get('file')).toBeTruthy();
    // A new version for the card, so its picture is not served from disk.
    await waitFor(() =>
      expect(queryClient.getQueryData(['acct', 'photo-versions'])).toEqual({
        'mcd21-25_en': expect.any(Number),
      }),
    );
  });

  it('sends nothing when the photo is cancelled', async () => {
    mockTakePhoto.mockResolvedValueOnce(null);
    mockPick.mockResolvedValueOnce(0); // Take a photo
    await render(withQueries(<CardDetail />));
    await userEvent.press(await screen.findByRole('button', { name: 'Add a photo of your copy' }));
    expect(mockTakePhoto).toHaveBeenCalledWith('camera');
    expect(photoRequests()).toHaveLength(0);
  });

  it('offers to change or remove a photo, and asks before removing', async () => {
    collection = [copy({ has_scan_photo: true })];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    mockPick.mockResolvedValueOnce(2); // Remove photo
    await render(withQueries(<CardDetail />));

    await userEvent.press(await screen.findByRole('button', { name: 'Change your photo' }));
    expect(mockPick).toHaveBeenCalledWith(
      'Your photo of this card',
      ['Take a photo', 'Choose from library', 'Remove photo'],
      { destructive: [2] },
    );
    expect(alert).toHaveBeenCalledWith('Remove your photo?', expect.any(String), expect.any(Array));
    await waitFor(() =>
      expect(photoRequests()).toEqual([['/api/collection/7/photo', { method: 'DELETE' }]]),
    );
    alert.mockRestore();
  });

  it('explains what to do for a card not owned', async () => {
    collection = [];
    await render(withQueries(<CardDetail />));
    expect(await screen.findByText(/Add a copy to your collection/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /photo/ })).not.toBeOnTheScreen();
  });

  it('is not offered for a card the catalogue has a picture of', async () => {
    card = { ...NO_PICTURE, images_small: 'https://assets.tcgdex.net/en/x/low.webp' };
    await render(withQueries(<CardDetail />));
    expect(await screen.findByRole('header', { name: 'Pikachu' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /photo/ })).not.toBeOnTheScreen();
  });
});
