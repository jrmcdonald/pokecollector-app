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

jest.mock('@/session/session', () => ({
  useSession: () => ({
    session: {
      status: 'signedIn',
      cacheId: 'acct',
      accounts: [],
      client: { activeBaseUrl: 'https://pc.example.com', accessHeaders: {}, sessionToken: 't' },
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

  it('says how many are owned', async () => {
    await render(<CardTile card={card} detail="€1.20" quantity={2} />);
    expect(screen.getByRole('button', { name: 'Pikachu, 2 owned' })).toBeOnTheScreen();
  });

  it('says when a checklist card is missing', async () => {
    await render(<CardTile card={card} dimmed />);
    expect(screen.getByRole('button', { name: 'Pikachu, missing' })).toBeOnTheScreen();
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
