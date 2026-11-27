/**
 * A set's checklist, searched and filtered over its one response. The
 * search sits above the list, which starts again for each search, so typing
 * keeps the field and its focus, and only what matches is left.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import SetChecklist from '@/app/set/[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'sv3pt5' }),
  Stack: { Screen: () => null },
}));

// The 151 subset of the simulator's fake server, every other card owned.
const NAMES = ['Bulbasaur', 'Charmander', 'Charmeleon', 'Charizard ex', 'Caterpie', 'Raticate'];
const mockRequest = jest.fn(async () => ({
  set: { id: 'sv3pt5', name: '151' },
  cards: NAMES.map((name, i) => ({
    id: `sv3pt5-${i + 1}`,
    name,
    number: String(i + 1).padStart(3, '0'),
    owned: i % 2 === 0,
    owned_quantity: i % 2 === 0 ? 1 : 0,
  })),
  owned_count: 3,
  total_count: NAMES.length,
}));
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
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => queryClient.clear());

const shownNames = () =>
  NAMES.filter((name) => screen.queryByRole('button', { name: new RegExp(`^${name}`) }));

async function open() {
  await render(
    <QueryClientProvider client={queryClient}>
      <SetChecklist />
    </QueryClientProvider>,
  );
  return screen.findByLabelText('Search this set');
}

it('leaves only what the whole search finds, typed a letter at a time', async () => {
  const field = await open();
  expect(shownNames()).toEqual(NAMES);
  for (const text of ['c', 'ch', 'cha', 'char']) await fireEvent.changeText(field, text);
  expect(shownNames()).toEqual(['Charmander', 'Charmeleon', 'Charizard ex']);
  // The field is the same one, still holding what was typed.
  expect(screen.getByLabelText('Search this set')).toBe(field);
  expect(field.props.value).toBe('char');
});

it('narrows by what is owned, and says so when nothing matches', async () => {
  const field = await open();
  await fireEvent.press(screen.getByRole('radio', { name: /^Missing/ }));
  expect(shownNames()).toEqual(['Charmander', 'Charizard ex', 'Raticate']);
  await fireEvent.changeText(field, 'bulba');
  expect(screen.getByText('No missing card in this set matches.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
  expect(shownNames()).toEqual(NAMES);
  expect(field.props.value).toBe('');
});
