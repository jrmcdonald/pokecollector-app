/**
 * Accessibility of the composite components: what VoiceOver reads for a
 * card, a row or an avatar, and that nested buttons stay reachable.
 */
import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { Avatar } from '../avatar';
import { CardTile } from '../card-tile';
import { ListRow } from '../list-row';
import { SecretField } from '../secret-field';
import { EmptyState } from '../states';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockPick = jest.fn();
jest.mock('@/utils/pick', () => ({ pick: (...args: unknown[]) => mockPick(...args) }));

jest.mock('@/session/session', () => ({
  useSession: () => ({
    session: {
      status: 'signedIn',
      cacheId: 'acct',
      accounts: [],
      client: { activeBaseUrl: 'https://pc.example.com', proxyHeaders: {}, sessionToken: 't' },
    },
  }),
}));

describe('SecretField', () => {
  function Secret() {
    const [value, setValue] = useState('0123456789abcdef');
    return (
      <SecretField label="Service token client secret" value={value} onChangeText={setValue} />
    );
  }

  it('reads the saved secret as a length, never its value', async () => {
    await render(<Secret />);
    expect(
      screen.getByLabelText('Service token client secret: saved, 16 characters'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/0123/)).not.toBeOnTheScreen();
  });

  it('keeps Replace reachable, and Keep restores the saved value', async () => {
    const user = userEvent.setup();
    await render(<Secret />);
    await user.press(
      screen.getByRole('button', { name: 'Replace the service token client secret' }),
    );
    expect(screen.getByLabelText('Service token client secret')).toHaveDisplayValue('');
    await user.press(screen.getByRole('button', { name: 'Keep the saved one' }));
    expect(
      screen.getByLabelText('Service token client secret: saved, 16 characters'),
    ).toBeOnTheScreen();
  });
});

describe('ListRow', () => {
  it('is one button, named by its title and subtitle', async () => {
    const onPress = jest.fn();
    await render(<ListRow title="Wishlist" subtitle="Cards you want" onPress={onPress} />);
    const row = screen.getByRole('button', { name: /Wishlist/ });
    expect(row).toHaveAccessibleName(/Cards you want/);
    await userEvent.setup().press(row);
    expect(onPress).toHaveBeenCalled();
  });
});

describe('CardTile', () => {
  const card = {
    id: 'sv1-025_en',
    name: 'Pikachu',
    images_small: 'https://assets.tcgdex.net/en/sv/sv01/025/low.webp',
  };

  it('says how many are owned, and the detail line', async () => {
    await render(<CardTile card={card} detail="€1.20" quantity={2} />);
    expect(screen.getByRole('button', { name: 'Pikachu, 2 owned, €1.20' })).toBeOnTheScreen();
    expect(screen.getByText('×2')).toBeOnTheScreen();
  });

  it('shows no quantity badge for a single copy', async () => {
    await render(<CardTile card={card} quantity={1} />);
    expect(screen.queryByText('×1')).not.toBeOnTheScreen();
  });

  it('marks a missing card in words as well as by fading it', async () => {
    await render(<CardTile card={card} missing />);
    expect(screen.getByRole('button', { name: 'Pikachu, missing' })).toBeOnTheScreen();
    expect(screen.getByText('Missing')).toBeOnTheScreen();
  });

  it('offers its extra actions to VoiceOver', async () => {
    const onAction = jest.fn();
    await render(
      <CardTile
        card={card}
        actions={[{ name: 'remove', label: 'Take out of binder', onAction }]}
      />,
    );
    const tile = screen.getByRole('button', { name: 'Pikachu' });
    expect(tile.props.accessibilityActions).toEqual([
      { name: 'remove', label: 'Take out of binder' },
    ]);
    tile.props.onAccessibilityAction({ nativeEvent: { actionName: 'remove' } });
    expect(onAction).toHaveBeenCalled();
  });

  it('offers the same actions in a sheet when held, destructive ones in red', async () => {
    const onAction = jest.fn();
    mockPick.mockResolvedValueOnce(0);
    await render(
      <CardTile
        card={card}
        actions={[{ name: 'remove', label: 'Take out of binder', destructive: true, onAction }]}
      />,
    );
    await userEvent.setup().longPress(screen.getByRole('button', { name: 'Pikachu' }));
    expect(mockPick).toHaveBeenCalledWith('Pikachu', ['Take out of binder'], { destructive: [0] });
    expect(onAction).toHaveBeenCalled();
  });
});

describe('ListRow kinds', () => {
  it('names a row by its title and subtitle when given no label', async () => {
    await render(
      <ListRow title="Clear cached data" subtitle="Refetch" kind="action" onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Clear cached data, Refetch' })).toBeOnTheScreen();
  });

  it('is disabled without an action', async () => {
    await render(<ListRow title="ash" subtitle="Current account" />);
    expect(screen.getByRole('button', { name: 'ash, Current account' })).toBeDisabled();
  });
});

describe('Avatar', () => {
  it('is hidden from VoiceOver, since the name beside it is read instead', async () => {
    await render(<Avatar name="ash" />);
    expect(screen.queryByText('A')).not.toBeVisible();
  });
});

describe('EmptyState', () => {
  it('offers its action as a named button', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState title="Nothing here yet" action={{ title: 'Search the catalogue', onPress }} />,
    );
    expect(screen.getByText('Nothing here yet')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Search the catalogue' }));
    expect(onPress).toHaveBeenCalled();
  });
});
