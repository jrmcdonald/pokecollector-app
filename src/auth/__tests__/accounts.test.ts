import type { ServerCredentials } from '@/api/client';

import {
  activeAccount,
  credentialsFor,
  parseState,
  parseV3,
  withAccount,
  withActive,
  withCredentials,
  withoutAccount,
  type StoredState,
} from '../accounts';

const creds: ServerCredentials = {
  primaryUrl: 'https://home.example.com',
  fallbackUrl: 'https://pc.example.com',
  proxy: { kind: 'cloudflare', clientId: 'id.access', clientSecret: 'secret' },
  username: 'ash',
  password: 'pikachu',
};

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

function twoAccounts(): StoredState {
  const newId = ids();
  const one = withCredentials(null, creds, newId);
  return withAccount(one, { username: 'misty', password: 'starmie' }, newId);
}

describe('withCredentials', () => {
  it('starts with one active account', () => {
    const state = withCredentials(null, creds, ids());
    expect(state.accounts).toEqual([{ id: 'id1', username: 'ash', password: 'pikachu' }]);
    expect(state.activeId).toBe('id1');
    expect(credentialsFor(state.server, activeAccount(state))).toEqual(creds);
  });

  it('keeps the id when the same account changes its password or the addresses change', () => {
    const state = withCredentials(
      twoAccounts(),
      { ...creds, username: 'misty', password: 'new', fallbackUrl: null },
      ids(),
    );
    expect(state.activeId).toBe('id2');
    expect(state.accounts).toHaveLength(2);
    expect(activeAccount(state).password).toBe('new');
    expect(state.server.fallbackUrl).toBeNull();
  });

  it('switches to a saved account when its username is entered', () => {
    const state = withCredentials(twoAccounts(), { ...creds, password: 'changed' }, ids());
    expect(state.activeId).toBe('id1');
    expect(activeAccount(state).password).toBe('changed');
    expect(state.accounts).toHaveLength(2);
  });

  it('replaces the active account with a new one for a new username', () => {
    const state = withCredentials(twoAccounts(), { ...creds, username: 'brock' }, () => 'fresh');
    expect(state.accounts.map((a) => a.username)).toEqual(['ash', 'brock']);
    expect(state.activeId).toBe('fresh');
  });

  it('forgets every account when the server changes', () => {
    const state = withCredentials(
      twoAccounts(),
      { ...creds, primaryUrl: 'https://other.example.com' },
      () => 'fresh',
    );
    expect(state.accounts).toEqual([{ id: 'fresh', username: 'ash', password: 'pikachu' }]);
  });
});

describe('withAccount', () => {
  it('adds and activates an account on the same server', () => {
    const state = twoAccounts();
    expect(state.accounts.map((a) => a.username)).toEqual(['ash', 'misty']);
    expect(state.activeId).toBe('id2');
    expect(state.server.primaryUrl).toBe(creds.primaryUrl);
  });

  it('updates a saved username instead of duplicating it', () => {
    const state = withAccount(twoAccounts(), { username: 'ash', password: 'x' }, () => 'dup');
    expect(state.accounts).toHaveLength(2);
    expect(state.activeId).toBe('id1');
    expect(activeAccount(state).password).toBe('x');
  });
});

describe('withActive and withoutAccount', () => {
  it('switches only to an account that exists', () => {
    expect(withActive(twoAccounts(), 'id1').activeId).toBe('id1');
    expect(withActive(twoAccounts(), 'nope').activeId).toBe('id2');
  });

  it('removes an inactive account and keeps the active one', () => {
    const state = withoutAccount(withActive(twoAccounts(), 'id1'), 'id2');
    expect(state?.accounts.map((a) => a.id)).toEqual(['id1']);
    expect(state?.activeId).toBe('id1');
  });

  it('activates the first remaining account when the active one goes', () => {
    expect(withoutAccount(twoAccounts(), 'id2')?.activeId).toBe('id1');
  });

  it('refuses to remove the last account', () => {
    expect(withoutAccount(withCredentials(null, creds, ids()), 'id1')).toBeNull();
  });
});

describe('parsing', () => {
  it('round-trips the stored state', () => {
    const state = twoAccounts();
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });

  it('repairs an active id that is not in the list', () => {
    expect(parseState(JSON.stringify({ ...twoAccounts(), activeId: 'gone' }))?.activeId).toBe(
      'id1',
    );
  });

  it('rejects anything malformed', () => {
    expect(parseState(null)).toBeNull();
    expect(parseState('not json')).toBeNull();
    expect(parseState(JSON.stringify({ ...twoAccounts(), accounts: [] }))).toBeNull();
    expect(parseState(JSON.stringify({ ...twoAccounts(), server: { primaryUrl: 1 } }))).toBeNull();
  });

  it('migrates the single-account format, keeping its cache id', () => {
    // v3 kept the service token as two strings.
    const { proxy: _proxy, ...rest } = creds;
    const old = { ...rest, accessClientId: 'id.access', accessClientSecret: 'secret' };
    const v3 = JSON.stringify({ credentials: old, cacheId: 'old-cache' });
    expect(parseV3(v3)).toEqual({
      server: { primaryUrl: creds.primaryUrl, fallbackUrl: creds.fallbackUrl, proxy: creds.proxy },
      accounts: [{ id: 'old-cache', username: 'ash', password: 'pikachu' }],
      activeId: 'old-cache',
    });
    expect(parseV3(JSON.stringify({ credentials: old }))).toBeNull();
  });

  it('migrates the v4 format, whose server kept a Cloudflare service token', () => {
    const v4 = (accessClientId: string, accessClientSecret: string) =>
      JSON.stringify({
        ...twoAccounts(),
        server: {
          primaryUrl: creds.primaryUrl,
          fallbackUrl: creds.fallbackUrl,
          accessClientId,
          accessClientSecret,
        },
      });
    expect(parseState(v4('id.access', 'secret'))?.server.proxy).toEqual(creds.proxy);
    // Both blank was how v4 said there was no Access in front.
    expect(parseState(v4('', ''))?.server.proxy).toEqual({ kind: 'none' });
  });

  it('reads each kind of proxy, and rejects one it does not know', () => {
    const withProxy = (proxy: unknown) =>
      parseState(JSON.stringify({ ...twoAccounts(), server: { ...twoAccounts().server, proxy } }));
    const headers = { kind: 'headers', headers: [{ name: 'X-Api-Key', value: 'k' }] };
    expect(withProxy({ kind: 'none' })?.server.proxy).toEqual({ kind: 'none' });
    expect(withProxy(headers)?.server.proxy).toEqual(headers);
    expect(withProxy({ kind: 'vpn' })).toBeNull();
    expect(withProxy({ kind: 'headers', headers: [{ name: 'X' }] })).toBeNull();
  });
});
