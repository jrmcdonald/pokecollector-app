import { PokeCollectorClient, type ServerCredentials } from '../client';
import { verifyConnection } from '../verify';
import { CREDENTIALS, fakeFetch, loginOk, type Call } from './fake-server';

const ME = { id: 1, username: 'ash', role: 'user', must_change_password: false };
const HOME = 'https://home.example.com';
const PUBLIC = 'https://pc.example.com';

type Route = Parameters<typeof fakeFetch>[0];

function verify(route: Route, credentials: ServerCredentials = CREDENTIALS) {
  const { fetch } = fakeFetch(route);
  return verifyConnection(credentials, (c) => new PokeCollectorClient(c, fetch));
}

const healthy: Route = ({ url }) => {
  if (url.endsWith('/mode')) return { status: 200, body: { multi_user: true, locked: true } };
  if (url.endsWith('/login')) return loginOk('t');
  return { status: 200, body: ME };
};

const unreachableAt =
  (host: string, otherwise: Route): Route =>
  (call: Call) => {
    if (call.url.startsWith(host)) throw new TypeError('Network request failed');
    return otherwise(call);
  };

describe('verifyConnection', () => {
  it('passes when the proxy and the account both work', async () => {
    expect(await verify(healthy)).toEqual({ ok: true, user: ME, token: 't', notes: [] });
  });

  it('blames the proxy when the anonymous check is redirected', async () => {
    const result = await verify(() => ({ status: 302 }));
    expect(result).toMatchObject({ ok: false, route: 'primary', step: 'proxy' });
  });

  it('blames the account when the password is wrong', async () => {
    const result = await verify(({ url }) =>
      url.endsWith('/mode')
        ? { status: 200, body: { multi_user: true } }
        : { status: 401, body: { detail: 'Incorrect username or password' } },
    );
    expect(result).toEqual({
      ok: false,
      route: 'primary',
      step: 'account',
      message: 'PokeCollector rejected the username or password.',
    });
  });

  it('refuses a server with its login screen switched off', async () => {
    const result = await verify(() => ({
      status: 200,
      body: { multi_user: false, locked: false },
    }));
    expect(result).toMatchObject({ ok: false, step: 'account', message: /single-user mode/ });
  });

  it('stops on an account that must change its password', async () => {
    const result = await verify((call) =>
      call.url.endsWith('/me')
        ? { status: 200, body: { ...ME, must_change_password: true } }
        : healthy(call),
    );
    expect(result).toMatchObject({ ok: false, step: 'account', message: /new password/ });
  });

  describe('with a fallback address', () => {
    const both = { ...CREDENTIALS, primaryUrl: HOME, fallbackUrl: PUBLIC };

    it('tests both', async () => {
      const { fetch, calls } = fakeFetch(healthy);
      const result = await verifyConnection(both, (c) => new PokeCollectorClient(c, fetch));
      expect(result).toEqual({ ok: true, user: ME, token: 't', notes: [] });
      expect(calls.some((c) => c.url.startsWith(HOME))).toBe(true);
      expect(calls.some((c) => c.url.startsWith(PUBLIC))).toBe(true);
    });

    it('accepts an unreachable primary when the fallback works, and says so', async () => {
      const result = await verify(unreachableAt(HOME, healthy), both);
      expect(result).toMatchObject({
        ok: true,
        user: ME,
        notes: [/primary address did not answer/],
      });
    });

    it('accepts an unreachable fallback when the primary works', async () => {
      const result = await verify(unreachableAt(PUBLIC, healthy), both);
      expect(result).toMatchObject({ ok: true, notes: [/fallback address did not answer/] });
    });

    it('fails when an address answers wrongly, even if the other works', async () => {
      const result = await verify(
        (call) => (call.url.startsWith(PUBLIC) ? { status: 302 } : healthy(call)),
        both,
      );
      expect(result).toMatchObject({ ok: false, route: 'fallback', step: 'proxy' });
    });

    it('fails when neither answers', async () => {
      const result = await verify(() => {
        throw new TypeError('Network request failed');
      }, both);
      expect(result).toMatchObject({ ok: false, route: null, step: 'unreachable' });
    });
  });
});
