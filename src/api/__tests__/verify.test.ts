import { PokeCollectorClient } from '../client';
import { verifyConnection } from '../verify';
import { CREDENTIALS, fakeFetch, loginOk } from './fake-server';

const ME = { id: 1, username: 'ash', role: 'user', must_change_password: false };

function client(route: Parameters<typeof fakeFetch>[0]) {
  return new PokeCollectorClient(CREDENTIALS, fakeFetch(route).fetch);
}

describe('verifyConnection', () => {
  it('passes when Access and the account both work', async () => {
    const result = await verifyConnection(
      client(({ url }) => {
        if (url.endsWith('/mode')) return { status: 200, body: { multi_user: true, locked: true } };
        if (url.endsWith('/login')) return loginOk('t');
        return { status: 200, body: ME };
      }),
    );
    expect(result).toEqual({ ok: true, user: ME });
  });

  it('blames Access when the anonymous check is redirected', async () => {
    const result = await verifyConnection(client(() => ({ status: 302 })));
    expect(result).toMatchObject({ ok: false, step: 'access' });
  });

  it('blames the account when the password is wrong', async () => {
    const result = await verifyConnection(
      client(({ url }) =>
        url.endsWith('/mode')
          ? { status: 200, body: { multi_user: true } }
          : { status: 401, body: { detail: 'Incorrect username or password' } },
      ),
    );
    expect(result).toEqual({
      ok: false,
      step: 'account',
      message: 'PokeCollector rejected the username or password.',
    });
  });

  it('refuses a server with its login screen switched off', async () => {
    const result = await verifyConnection(
      client(() => ({ status: 200, body: { multi_user: false, locked: false } })),
    );
    expect(result).toMatchObject({ ok: false, step: 'account', message: /single-user mode/ });
  });

  it('stops on an account that must change its password', async () => {
    const result = await verifyConnection(
      client(({ url }) => {
        if (url.endsWith('/mode')) return { status: 200, body: { multi_user: true } };
        if (url.endsWith('/login')) return loginOk('t');
        return { status: 200, body: { ...ME, must_change_password: true } };
      }),
    );
    expect(result).toMatchObject({ ok: false, step: 'account', message: /new password/ });
  });
});
