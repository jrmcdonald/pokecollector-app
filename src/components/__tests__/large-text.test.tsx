/**
 * Layouts at the largest text sizes, where side-by-side controls and three
 * columns of tiles no longer fit. The text size comes from the window's
 * fontScale, set here per test.
 */
import { render, renderHook, screen } from '@testing-library/react-native';

import { useCardColumns } from '@/hooks/use-large-text';

import { CardTile } from '../card-tile';
import { PriceChart } from '../price-chart';
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

it('keeps the columns a screen opened with when the text size changes', async () => {
  mockFontScale = 3.118;
  const { result, rerender } = await renderHook(() => useCardColumns());
  expect(result.current).toBe(1);
  // As Apple's audit does for a moment, or Settings while the screen is open.
  mockFontScale = 1;
  await rerender({});
  expect(result.current).toBe(1);
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

describe('PriceChart', () => {
  const day = (date: string, price: number) => ({
    date,
    time: Date.parse(`${date}T00:00:00Z`),
    price,
  });
  const points = [day('2026-07-01', 20.13), day('2026-08-15', 24.7), day('2026-09-30', 23.5)];
  const chart = (
    <PriceChart points={points} summary="Trend price over the past 3 months" onScrub={jest.fn()} />
  );

  // The labels are hidden from VoiceOver, which reads the chart's summary.
  // Node's ICU says "Sept" where iOS says "Sep".
  const hidden = { includeHiddenElements: true };

  it('labels the axis beside the plot at the usual sizes', async () => {
    await render(chart);
    expect(screen.getByText('1 Jul', hidden)).toBeOnTheScreen();
    expect(screen.getByText(/^30 Sept?$/, hidden)).toBeOnTheScreen();
    expect(screen.queryByText(/^Low /, hidden)).toBeNull();
  });

  it('keeps the layout it opened with when the text size changes', async () => {
    mockFontScale = 3.118;
    const view = await render(chart);
    // As Apple's audit does for a moment.
    mockFontScale = 1;
    await view.rerender(
      <PriceChart
        points={points}
        summary="Trend price over the past 3 months"
        onScrub={jest.fn()}
      />,
    );
    expect(screen.getByText(/^1 Jul to 30 Sept?$/, hidden)).toBeOnTheScreen();
  });

  it('puts the days, low and high under the plot once the text is large', async () => {
    mockFontScale = 1.353;
    await render(chart);
    expect(screen.getByText(/^1 Jul to 30 Sept?$/, hidden)).toBeOnTheScreen();
    const range = screen.getByText('Low €20.13, high €24.70', hidden);
    expect(range.props.numberOfLines).toBeUndefined();
  });
});
