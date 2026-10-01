import { buildUrl, PokeCollectorClient, PRIMARY_PROBE_TIMEOUT_MS } from '../client';
import {
  ProxyError,
  AuthError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ResponseShapeError,
  ServerError,
  ValidationError,
} from '../errors';
import type { ProxyAuth } from '../proxy';
import { UserSchema } from '../schemas';
import { CREDENTIALS, fakeFetch, loginOk, type Call } from './fake-server';

const ME = { id: 1, username: 'ash', role: 'user', must_change_password: false };

describe('PokeCollectorClient', () => {
  it('sends the Access headers and bearer token, and never follows redirects', async () => {
    const { fetch, calls } = fakeFetch(({ url }) =>
      url.endsWith('/api/auth/login') ? loginOk('t1') : { status: 200, body: ME },
    );
    const client = new PokeCollectorClient(CREDENTIALS, fetch);

    await expect(client.request('/api/auth/me', { schema: UserSchema })).resolves.toMatchObject({
      username: 'ash',
    });

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://pc.example.com/api/auth/login',
      'GET https://pc.example.com/api/auth/me',
    ]);
    for (const call of calls) {
      expect(call.headers['CF-Access-Client-Id']).toBe('id.access');
      expect(call.headers['CF-Access-Client-Secret']).toBe('secret');
    }
    const [login, me] = calls;
    expect(login?.headers.Authorization).toBeUndefined();
    expect(login?.body).toBe('username=ash&password=pikachu');
    expect(login?.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(me?.headers.Authorization).toBe('Bearer t1');
  });

  it('never sends or stores cookies', async () => {
    const { fetch, calls } = fakeFetch(({ url }) =>
      url.endsWith('/login') ? loginOk('t1') : { status: 200, body: ME },
    );
    await new PokeCollectorClient(CREDENTIALS, fetch).request('/api/auth/me');
    expect(calls.every((c) => c.credentials === 'omit')).toBe(true);
  });

  it('sends no proxy headers for a server with nothing in front', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { multi_user: true } }));
    const client = new PokeCollectorClient({ ...CREDENTIALS, proxy: { kind: 'none' } }, fetch);
    await client.requestAnonymous('/api/auth/mode');
    expect(Object.keys(calls[0]?.headers ?? {})).not.toContain('CF-Access-Client-Id');
    expect(client.proxyHeaders).toEqual({});
  });

  it('uses a token it is given instead of logging in', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: ME }));
    const client = new PokeCollectorClient(CREDENTIALS, fetch, { token: 'seeded' });
    await client.request('/api/auth/me');
    expect(calls.map((c) => c.url)).toEqual(['https://pc.example.com/api/auth/me']);
    expect(calls[0]?.headers.Authorization).toBe('Bearer seeded');
  });

  it('stops trying to log in once the password is rejected', async () => {
    const { fetch, calls } = fakeFetch(({ url }) =>
      url.endsWith('/login')
        ? { status: 401, body: { detail: 'Incorrect username or password' } }
        : { status: 401, body: { detail: 'expired' } },
    );
    // A stale token, as if the password changed after the last login.
    const client = new PokeCollectorClient(CREDENTIALS, fetch, { token: 'stale' });
    for (let i = 0; i < 3; i += 1) {
      await expect(client.request('/api/auth/me')).rejects.toThrow(
        'PokeCollector rejected the username or password.',
      );
    }
    expect(calls.filter((c) => c.url.endsWith('/login'))).toHaveLength(1);
    expect(client.sessionToken).toBeNull();
  });

  it('reuses the token across requests', async () => {
    const { fetch, calls } = fakeFetch(({ url }) =>
      url.endsWith('/login') ? loginOk('t1') : { status: 200, body: ME },
    );
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await client.request('/api/auth/me');
    await client.request('/api/auth/me');
    expect(calls.filter((c) => c.url.endsWith('/login'))).toHaveLength(1);
  });

  it('logs in again once when the token is rejected, and retries', async () => {
    let tokens = 0;
    const { fetch, calls } = fakeFetch(({ url, headers }) => {
      if (url.endsWith('/login')) return loginOk(`t${++tokens}`);
      return headers.Authorization === 'Bearer t2'
        ? { status: 200, body: ME }
        : { status: 401, body: { detail: 'Could not validate credentials' } };
    });
    const client = new PokeCollectorClient(CREDENTIALS, fetch);

    await expect(client.request('/api/auth/me')).resolves.toEqual(ME);
    expect(calls.filter((c) => c.url.endsWith('/login'))).toHaveLength(2);
  });

  it('shares one login between concurrent requests that all see a stale token', async () => {
    let tokens = 0;
    const { fetch, calls } = fakeFetch(async ({ url, headers }) => {
      if (url.endsWith('/login')) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return loginOk(`t${++tokens}`);
      }
      return headers.Authorization === 'Bearer t1'
        ? { status: 401, body: { detail: 'expired' } }
        : { status: 200, body: ME };
    });
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    // The first login yields t1, which the server rejects; the client moves on to t2.
    await client.request('/api/auth/me');
    const loginsBefore = calls.filter((c) => c.url.endsWith('/login')).length;

    // Put the stale token back, as if it had expired, and fire several requests at once.
    (client as unknown as { token: string }).token = 't1';
    await Promise.all([1, 2, 3, 4].map(() => client.request('/api/auth/me')));

    const loginsAfter = calls.filter((c) => c.url.endsWith('/login')).length;
    expect(loginsAfter - loginsBefore).toBe(1);
  });

  it('shares the first login between concurrent requests', async () => {
    const { fetch, calls } = fakeFetch(async ({ url }) => {
      if (url.endsWith('/login')) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return loginOk('t1');
      }
      return { status: 200, body: ME };
    });
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await Promise.all([1, 2, 3].map(() => client.request('/api/auth/me')));
    expect(calls.filter((c) => c.url.endsWith('/login'))).toHaveLength(1);
  });

  it('reports a rejected password as an AuthError without retrying the login', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      status: 401,
      body: { detail: 'Incorrect username or password' },
    }));
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await expect(client.request('/api/auth/me')).rejects.toThrow(
      new AuthError('PokeCollector rejected the username or password.'),
    );
    expect(calls).toHaveLength(1);
  });

  it('gives up after one re-login if the new token is rejected too', async () => {
    const { fetch } = fakeFetch(({ url }) =>
      url.endsWith('/login') ? loginOk('t') : { status: 401, body: { detail: 'nope' } },
    );
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await expect(client.request('/api/auth/me')).rejects.toThrow(/may have been deactivated/);
  });

  describe('other proxies', () => {
    it('sends custom proxy headers to every request, and no Access headers', async () => {
      const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { multi_user: true } }));
      const client = new PokeCollectorClient(
        {
          ...CREDENTIALS,
          proxy: { kind: 'headers', headers: [{ name: 'X-Api-Key', value: 'k1' }] },
        },
        fetch,
      );
      await client.requestAnonymous('/api/auth/mode');
      expect(calls[0]?.headers['X-Api-Key']).toBe('k1');
      expect(Object.keys(calls[0]?.headers ?? {})).not.toContain('CF-Access-Client-Id');
      expect(client.proxyHeaders).toEqual({ 'X-Api-Key': 'k1' });
    });

    it.each([
      [{ kind: 'cloudflare', clientId: 'i', clientSecret: 's' }, /Cloudflare Access/],
      [{ kind: 'headers', headers: [{ name: 'X-Api-Key', value: 'k' }] }, /Check its headers/],
      [{ kind: 'none' }, /If that proxy needs credentials/],
    ] as [ProxyAuth, RegExp][])(
      'says who turned the request away for a %j proxy',
      async (proxy, wording) => {
        const { fetch } = fakeFetch(() => ({ status: 302, headers: { location: '/login' } }));
        const client = new PokeCollectorClient({ ...CREDENTIALS, proxy }, fetch);
        await expect(client.requestAnonymous('/api/auth/mode')).rejects.toThrow(wording);
      },
    );
  });

  describe('Cloudflare Access', () => {
    it('treats a redirect as an Access rejection', async () => {
      const { fetch } = fakeFetch(() => ({
        status: 302,
        headers: { location: 'https://team.cloudflareaccess.com/cdn-cgi/access/login' },
      }));
      const client = new PokeCollectorClient(CREDENTIALS, fetch);
      await expect(client.requestAnonymous('/api/auth/mode')).rejects.toBeInstanceOf(ProxyError);
    });

    it('treats an HTML 200 (a followed redirect) as an Access rejection', async () => {
      const { fetch } = fakeFetch(() => ({
        status: 200,
        body: '<html>Sign in</html>',
        contentType: 'text/html',
        redirected: true,
      }));
      const client = new PokeCollectorClient(CREDENTIALS, fetch);
      await expect(client.requestAnonymous('/api/auth/mode')).rejects.toBeInstanceOf(ProxyError);
    });

    it('treats an HTML 403 as an Access rejection, not a PokeCollector one', async () => {
      const { fetch } = fakeFetch(() => ({
        status: 403,
        body: '<html>Forbidden</html>',
        contentType: 'text/html',
      }));
      const client = new PokeCollectorClient(CREDENTIALS, fetch);
      await expect(client.requestAnonymous('/api/auth/mode')).rejects.toBeInstanceOf(ProxyError);
    });

    it('reports a Cloudflare error page as a server problem', async () => {
      const { fetch } = fakeFetch(() => ({
        status: 530,
        body: '<html>Tunnel down</html>',
        contentType: 'text/html',
      }));
      const client = new PokeCollectorClient(CREDENTIALS, fetch);
      await expect(client.requestAnonymous('/api/auth/mode')).rejects.toBeInstanceOf(ServerError);
    });
  });

  it('maps upstream status codes to typed errors, keeping FastAPI detail', async () => {
    const cases: [number, unknown, new (...args: never[]) => Error, string][] = [
      [404, { detail: 'Card not found' }, NotFoundError, 'Card not found'],
      [
        422,
        { detail: [{ loc: ['body'], msg: 'Field required' }] },
        ValidationError,
        'Field required',
      ],
      [500, { detail: 'boom' }, ServerError, 'boom'],
    ];
    for (const [status, body, type, message] of cases) {
      const { fetch } = fakeFetch(() => ({ status, body }));
      const client = new PokeCollectorClient(CREDENTIALS, fetch);
      const error = await client.requestAnonymous('/x').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(type);
      expect((error as Error).message).toBe(message);
    }
  });

  it('carries Retry-After on a 429', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 429,
      body: { error: 'Rate limit exceeded: 60 per 1 minute' },
      headers: { 'retry-after': '12' },
    }));
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    const error = await client.requestAnonymous('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfter).toBe(12);
  });

  it('passes the login throttle message through', async () => {
    const { fetch } = fakeFetch(() => ({
      status: 429,
      body: { detail: 'Too many login attempts. Try again in 1 minute.' },
    }));
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await expect(client.request('/api/auth/me')).rejects.toThrow(
      'Too many login attempts. Try again in 1 minute.',
    );
  });

  it('rejects a body that does not match the schema', async () => {
    const { fetch } = fakeFetch(({ url }) =>
      url.endsWith('/login') ? loginOk('t') : { status: 200, body: { id: 'not a number' } },
    );
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await expect(client.request('/api/auth/me', { schema: UserSchema })).rejects.toBeInstanceOf(
      ResponseShapeError,
    );
  });

  it('turns a thrown fetch into a NetworkError', async () => {
    const client = new PokeCollectorClient(CREDENTIALS, async () => {
      throw new TypeError('Network request failed');
    });
    await expect(client.requestAnonymous('/x')).rejects.toBeInstanceOf(NetworkError);
  });

  it('times out', async () => {
    const client = new PokeCollectorClient(CREDENTIALS, (_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    await expect(client.requestAnonymous('/x', { timeoutMs: 10 })).rejects.toThrow(
      'The server did not answer in time.',
    );
  });
});

describe('primary and fallback addresses', () => {
  const HOME = 'https://home.example.com';
  const PUBLIC = 'https://pc.example.com';
  const BOTH = { ...CREDENTIALS, primaryUrl: HOME, fallbackUrl: PUBLIC };

  // A working server at both addresses unless `down` says otherwise.
  function server(down: { current: Set<string> }) {
    return fakeFetch((call: Call) => {
      const host = call.url.startsWith(HOME) ? HOME : PUBLIC;
      if (down.current.has(host)) throw new TypeError('Network request failed');
      if (call.url.endsWith('/mode')) return { status: 200, body: { multi_user: true } };
      if (call.url.endsWith('/login')) return loginOk('t');
      return { status: 200, body: ME };
    });
  }

  const hosts = (calls: Call[]) => calls.map((c) => `${c.method} ${c.url}`);

  it('does not probe when there is only one address', async () => {
    const { fetch, calls } = server({ current: new Set() });
    const client = new PokeCollectorClient(CREDENTIALS, fetch);
    await client.request('/api/auth/me');
    expect(calls.some((c) => c.url.endsWith('/mode'))).toBe(false);
    expect(client.activeRoute).toBe('primary');
  });

  it('prefers the primary when it answers, and remembers the choice', async () => {
    const { fetch, calls } = server({ current: new Set() });
    const client = new PokeCollectorClient(BOTH, fetch);
    await client.request('/api/auth/me');
    await client.request('/api/auth/me');
    expect(hosts(calls)).toEqual([
      `GET ${HOME}/api/auth/mode`,
      `POST ${HOME}/api/auth/login`,
      `GET ${HOME}/api/auth/me`,
      `GET ${HOME}/api/auth/me`,
    ]);
    expect(client.activeRoute).toBe('primary');
    expect(client.activeBaseUrl).toBe(HOME);
  });

  it('uses the fallback when the primary does not answer', async () => {
    const { fetch, calls } = server({ current: new Set([HOME]) });
    const client = new PokeCollectorClient(BOTH, fetch);
    await expect(client.request('/api/auth/me')).resolves.toEqual(ME);
    expect(client.activeRoute).toBe('fallback');
    expect(calls.filter((c) => c.url.startsWith(HOME))).toHaveLength(1);
  });

  it('gives the primary only a short time to answer the probe', async () => {
    const seen: number[] = [];
    const client = new PokeCollectorClient(BOTH, (url, init) => {
      if (url.startsWith(HOME)) {
        return new Promise((_resolve, reject) => {
          const started = Date.now();
          init.signal.addEventListener('abort', () => {
            seen.push(Date.now() - started);
            reject(new Error('aborted'));
          });
        });
      }
      return server({ current: new Set() }).fetch(url, init);
    });
    jest.useFakeTimers();
    try {
      const request = client.request('/api/auth/me');
      await jest.advanceTimersByTimeAsync(PRIMARY_PROBE_TIMEOUT_MS);
      await expect(request).resolves.toEqual(ME);
    } finally {
      jest.useRealTimers();
    }
    expect(seen).toEqual([PRIMARY_PROBE_TIMEOUT_MS]);
    expect(client.activeRoute).toBe('fallback');
  });

  it('prefers a fallback that works over a primary that answers wrongly', async () => {
    const { fetch } = fakeFetch((call) => {
      if (call.url.startsWith(HOME)) {
        return { status: 200, body: '<html>captive portal</html>', contentType: 'text/html' };
      }
      if (call.url.endsWith('/mode')) return { status: 200, body: { multi_user: true } };
      if (call.url.endsWith('/login')) return loginOk('t');
      return { status: 200, body: ME };
    });
    const client = new PokeCollectorClient(BOTH, fetch);
    await expect(client.request('/api/auth/me')).resolves.toEqual(ME);
    expect(client.activeRoute).toBe('fallback');
  });

  it("surfaces the primary's error when nothing works but the primary answered", async () => {
    const { fetch } = fakeFetch((call) => {
      if (call.url.startsWith(HOME)) return { status: 302 };
      throw new TypeError('Network request failed');
    });
    const client = new PokeCollectorClient(BOTH, fetch);
    await expect(client.request('/api/auth/me')).rejects.toBeInstanceOf(ProxyError);
  });

  it('reports both unreachable as a NetworkError', async () => {
    const { fetch } = server({ current: new Set([HOME, PUBLIC]) });
    const client = new PokeCollectorClient(BOTH, fetch);
    await expect(client.request('/api/auth/me')).rejects.toThrow(
      'Neither the primary nor the fallback server answered.',
    );
  });

  it('switches route and retries a GET when the current address stops answering', async () => {
    const down = { current: new Set<string>() };
    const { fetch } = server(down);
    const client = new PokeCollectorClient(BOTH, fetch);
    await client.request('/api/auth/me');
    expect(client.activeRoute).toBe('primary');

    down.current.add(HOME); // left home
    await expect(client.request('/api/auth/me')).resolves.toEqual(ME);
    expect(client.activeRoute).toBe('fallback');
  });

  it('does not retry anything but a GET, but still re-picks for next time', async () => {
    const down = { current: new Set<string>() };
    const { fetch, calls } = server(down);
    const client = new PokeCollectorClient(BOTH, fetch);
    await client.request('/api/auth/me');

    down.current.add(HOME);
    await expect(
      client.request('/api/collection/', { method: 'POST', json: { card_id: 'x' } }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(
      calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/collection/')),
    ).toHaveLength(1);
    expect(client.activeRoute).toBeNull();

    await client.request('/api/auth/me');
    expect(client.activeRoute).toBe('fallback');
  });

  it('probes again after invalidateRoute, and tells listeners', async () => {
    const down = { current: new Set([HOME]) };
    const { fetch } = server(down);
    const client = new PokeCollectorClient(BOTH, fetch);
    const changes: (string | null)[] = [];
    client.subscribeToRoute(() => changes.push(client.activeRoute));

    await client.request('/api/auth/me');
    down.current.clear(); // arrived home
    client.invalidateRoute();
    await client.request('/api/auth/me');

    expect(changes).toEqual(['fallback', null, 'primary']);
  });

  it('does not let a probe started before invalidateRoute set the route after it', async () => {
    let releaseHomeProbe: () => void = () => undefined;
    let homeUp = true;
    const { fetch, calls } = fakeFetch(async (call) => {
      const home = call.url.startsWith(HOME);
      if (home && call.url.endsWith('/mode') && releaseHomeProbe === noop) {
        // Hold the first probe until the test says so.
        await new Promise<void>((resolve) => {
          releaseHomeProbe = resolve;
        });
      }
      if (home && !homeUp) throw new TypeError('Network request failed');
      if (call.url.endsWith('/mode')) return { status: 200, body: { multi_user: true } };
      if (call.url.endsWith('/login')) return loginOk('t');
      return { status: 200, body: ME };
    });
    const noop = releaseHomeProbe;
    const client = new PokeCollectorClient(BOTH, fetch);

    const first = client.request('/api/auth/me');
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The phone leaves home while the first probe is still out.
    homeUp = false;
    client.invalidateRoute();
    releaseHomeProbe();

    await expect(first).resolves.toEqual(ME);
    expect(client.activeRoute).toBe('fallback');
    expect(calls.filter((c) => c.url === `${HOME}/api/auth/mode`)).toHaveLength(2);
  });

  it('takes a route from another client without probing', async () => {
    const { fetch, calls } = server({ current: new Set([HOME]) });
    const first = new PokeCollectorClient(BOTH, fetch);
    await first.request('/api/auth/me');
    const second = new PokeCollectorClient({ ...BOTH, username: 'misty' }, fetch);
    second.adoptRoute(first.activeRoute);
    calls.length = 0;
    await second.request('/api/auth/me');
    expect(hosts(calls)).toEqual([`POST ${PUBLIC}/api/auth/login`, `GET ${PUBLIC}/api/auth/me`]);
  });

  it('ignores an adopted fallback when it has none', () => {
    const client = new PokeCollectorClient(CREDENTIALS, server({ current: new Set() }).fetch);
    client.adoptRoute('fallback');
    expect(client.activeRoute).toBeNull();
  });

  it('shares one probe between concurrent requests', async () => {
    const { fetch, calls } = server({ current: new Set() });
    const client = new PokeCollectorClient(BOTH, fetch);
    await Promise.all([1, 2, 3].map(() => client.request('/api/auth/me')));
    expect(calls.filter((c) => c.url.endsWith('/mode'))).toHaveLength(1);
  });
});

describe('buildUrl', () => {
  it('joins the origin and path and drops empty query values', () => {
    expect(
      buildUrl('https://pc.example.com/', '/api/cards/search', {
        q: 'pika chu',
        page: 2,
        set_id: undefined,
        rarity: '',
        owned: null,
      }),
    ).toBe('https://pc.example.com/api/cards/search?q=pika%20chu&page=2');
  });
});
