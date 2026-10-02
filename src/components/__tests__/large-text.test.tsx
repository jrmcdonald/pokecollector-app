/**
 * Layouts at the largest text sizes, where side-by-side controls and three
 * columns of tiles no longer fit. The text size comes from the window's
 * fontScale, set here per test.
 */
import { render, renderHook, screen } from '@testing-library/react-native';

import { useCardColumns } from '@/hooks/use-large-text';

import { CardTile } from '../card-tile';
import { Segmented } from '../segmented';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/session/session', () => ({
  useSession: () => ({
    session: {
      status: 'signedIn',
      client: { activeBaseUrl: 'https://pc.example.com', proxyHeaders: {}, sessionToken: 't' },
    },
  }),
}));

afterEach(() => {
  mockFontScale = 1;
});

describe('useCardColumns', () => {
  it.each([
    [1, 3],
    [1.235, 3], // xxLarge
    [1.353, 2], // xxxLarge, the largest standard size
    [1.647, 1], // AX1
    [3.118, 1], // AX5
  ])('at %p× text, gives %p columns', async (scale, columns) => {
    mockFontScale = scale;
    const { result } = await renderHook(() => useCardColumns());
    expect(result.current).toBe(columns);
  });
});

describe('Segmented at the accessibility sizes', () => {
  const show = (
    <Segmented<'all' | 'missing' | 'owned'>
      label="Show"
      options={[
        { value: 'all', label: 'All' },
        { value: 'missing', label: 'Missing' },
        { value: 'owned', label: 'Owned' },
      ]}
      value="all"
      onChange={jest.fn()}
    />
  );

  it('keeps its segments side by side at the standard sizes', async () => {
    await render(show);
    expect(screen.getByLabelText('Show')).not.toHaveStyle({ flexDirection: 'column' });
  });

  it('stacks its segments, still radios with their positions', async () => {
    mockFontScale = 3.118;
    await render(show);
    expect(screen.getByLabelText('Show')).toHaveStyle({ flexDirection: 'column' });
    expect(screen.getByRole('radio', { name: 'All, 1 of 3' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Missing, 2 of 3' })).not.toBeSelected();
  });
});

describe('CardTile as a row', () => {
  const card = { id: 'sv3pt5-005_en', name: 'Charmeleon', images_small: null };

  it('reads as the tile does, with the mark as words beside the image', async () => {
    await render(<CardTile card={card} detail="005 · €0.30" missing layout="row" />);
    expect(
      screen.getByRole('button', { name: 'Charmeleon, missing, 005 · €0.30' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Missing')).toBeOnTheScreen();
    expect(screen.getByText('005 · €0.30')).toBeOnTheScreen();
  });

  it('shows the copies owned', async () => {
    await render(<CardTile card={card} quantity={2} layout="row" />);
    expect(screen.getByRole('button', { name: 'Charmeleon, 2 owned' })).toBeOnTheScreen();
    expect(screen.getByText('×2')).toBeOnTheScreen();
  });

  it('cuts nothing short', async () => {
    await render(<CardTile card={card} detail="005 · €0.30" layout="row" />);
    expect(screen.getByText('Charmeleon').props.numberOfLines).toBeUndefined();
  });
});
