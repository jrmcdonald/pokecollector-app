/**
 * The connection form's choice of what sits in front of the server: each
 * kind shows its own fields, and custom headers can be added and removed.
 */
import { render, screen, userEvent } from '@testing-library/react-native';

import type { ServerCredentials } from '@/api/client';

import { ConnectionForm } from '../connection-form';

const mockVerify = jest.fn();
jest.mock('@/api/verify', () => ({
  verifyConnection: (...args: unknown[]) => mockVerify(...args),
}));
jest.mock('@/session/session', () => ({ createClient: jest.fn() }));

const SAVED: ServerCredentials = {
  primaryUrl: 'https://home.example.com',
  fallbackUrl: null,
  proxy: { kind: 'cloudflare', clientId: 'id.access', clientSecret: 'secret' },
  username: 'ash',
  password: 'pikachu',
};

function form(initial?: ServerCredentials, onVerified = jest.fn()) {
  return <ConnectionForm initial={initial} submitTitle="Connect" onVerified={onVerified} />;
}

describe('ConnectionForm', () => {
  it('asks for no proxy credentials by default', async () => {
    await render(form());
    expect(screen.getByRole('radio', { name: 'None, 1 of 3' })).toBeSelected();
    expect(screen.queryByLabelText('Service token client ID')).toBeNull();
    expect(screen.queryByLabelText('Header 1 name')).toBeNull();
  });

  it('shows the saved Cloudflare service token, and hides it for another kind', async () => {
    const user = userEvent.setup();
    await render(form(SAVED));
    expect(screen.getByRole('radio', { name: 'Cloudflare, 2 of 3' })).toBeSelected();
    expect(screen.getByLabelText('Service token client ID')).toHaveDisplayValue('id.access');
    await user.press(screen.getByRole('radio', { name: 'None, 1 of 3' }));
    expect(screen.queryByLabelText('Service token client ID')).toBeNull();
  });

  it('adds and removes custom headers', async () => {
    const user = userEvent.setup();
    await render(form());
    await user.press(screen.getByRole('radio', { name: 'Headers, 3 of 3' }));
    expect(screen.getByLabelText('Header 1 name')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Remove header 1' })).toBeNull();

    await user.press(screen.getByRole('button', { name: 'Add a header' }));
    await user.type(screen.getByLabelText('Header 2 name'), 'X-Second');
    await user.press(screen.getByRole('button', { name: 'Remove header 1' }));
    expect(screen.getByLabelText('Header 1 name')).toHaveDisplayValue('X-Second');
    expect(screen.queryByLabelText('Header 2 name')).toBeNull();
  });

  it('saves the headers typed, after the connection test passes', async () => {
    const user = userEvent.setup();
    const onVerified = jest.fn().mockResolvedValue(undefined);
    mockVerify.mockResolvedValue({ ok: true, user: { username: 'ash' }, token: 't', notes: [] });
    await render(form({ ...SAVED, proxy: { kind: 'none' } }, onVerified));
    await user.press(screen.getByRole('radio', { name: 'Headers, 3 of 3' }));
    await user.type(screen.getByLabelText('Header 1 name'), 'X-Api-Key');
    await user.type(screen.getByLabelText('Header 1 value'), 'k1');
    await user.press(screen.getByRole('button', { name: 'Connect' }));
    expect(onVerified).toHaveBeenCalledWith(
      { ...SAVED, proxy: { kind: 'headers', headers: [{ name: 'X-Api-Key', value: 'k1' }] } },
      { username: 'ash' },
      't',
    );
  });

  it('names the proxy that turned the test away', async () => {
    const user = userEvent.setup();
    mockVerify.mockResolvedValue({
      ok: false,
      route: 'primary',
      step: 'proxy',
      message: 'Cloudflare Access turned the request away.',
    });
    await render(form(SAVED));
    await user.press(screen.getByRole('button', { name: 'Connect' }));
    expect(
      screen.getByText('Could not get through Cloudflare Access (primary address)'),
    ).toBeOnTheScreen();
  });
});
