import { buildUrl, PokeCollectorClient } from '../client';
import {
  AccessError,
  AuthError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ResponseShapeError,
  ServerError,
  ValidationError,
} from '../errors';
import { UserSchema } from '../schemas';
import { CREDENTIALS, fakeFetch, loginOk } from './fake-server';

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

  describe('Cloudflare Access', () => {
    it('treats a redirect as an Access rejection', async () => {
      const { fetch } = fakeFetch(() => ({
        status: 302,
        headers: { location: 'https://team.cloudflareaccess.com/cdn-cgi/access/login' },
      }));
      const client = new PokeCollectorClient(CREDENTIALS, fetch);
      await expect(client.requestAnonymous('/api/auth/mode')).rejects.toBeInstanceOf(AccessError);
    });

    it('treats an HTML 200 (a followed redirect) as an Access rejection', async () => {
      const { fetch } = fakeFetch(() => ({
        status: 200,
        body: '<html>Sign in</html>',
        contentType: 'text/html',
        redirected: true,
      }));
      const client = new PokeCollectorClient(CREDENTIALS, fetch);
      await expect(client.requestAnonymous('/api/auth/mode')).rejects.toBeInstanceOf(AccessError);
    });

    it('treats an HTML 403 as an Access rejection, not a PokeCollector one', async () => {
      const { fetch } = fakeFetch(() => ({
        status: 403,
        body: '<html>Forbidden</html>',
        contentType: 'text/html',
      }));
      const client = new PokeCollectorClient(CREDENTIALS, fetch);
      await expect(client.requestAnonymous('/api/auth/mode')).rejects.toBeInstanceOf(AccessError);
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
