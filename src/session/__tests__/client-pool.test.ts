import { PokeCollectorClient, type ServerCredentials } from '@/api/client';
import { withAccount, withActive, withCredentials, withoutAccount } from '@/auth/accounts';

import { ClientPool } from '../client-pool';

const creds: ServerCredentials = {
  primaryUrl: 'https://home.example.com',
  fallbackUrl: 'https://pc.example.com',
  accessClientId: 'id.access',
  accessClientSecret: 'secret',
  username: 'ash',
  password: 'pikachu',
};

function setup() {
  let n = 0;
  const newId = () => `id${++n}`;
  const created: { credentials: ServerCredentials; token?: string }[] = [];
  const pool = new ClientPool((credentials, token) => {
    created.push({ credentials, token });
    return new PokeCollectorClient(
      credentials,
      async () => {
        throw new Error('no network in this test');
      },
      { token },
    );
  });
  const one = withCredentials(null, creds, newId);
  const two = withAccount(one, { username: 'misty', password: 'starmie' }, newId);
  return { pool, created, one, two };
}

describe('ClientPool', () => {
  it('gives each account its own client, with its own login and token', () => {
    const { pool, created, one, two } = setup();
    const ash = pool.activate(one, { fresh: true, token: 'ash-token' });
    const misty = pool.activate(two, { fresh: true, token: 'misty-token' });
    expect(ash).not.toBe(misty);
    expect(ash.sessionToken).toBe('ash-token');
    expect(misty.sessionToken).toBe('misty-token');
    expect(created.map((c) => c.credentials.username)).toEqual(['ash', 'misty']);
  });

  it('reuses a client when switching back, so no new login is needed', () => {
    const { pool, created, one, two } = setup();
    const ash = pool.activate(one, { fresh: true, token: 'ash-token' });
    pool.activate(two, { fresh: true });
    expect(pool.activate(withActive(two, 'id1'))).toBe(ash);
    expect(pool.active).toBe(ash);
    expect(created).toHaveLength(2);
  });

  it('hands the route to a newly created client', () => {
    const { pool, one, two } = setup();
    const ash = pool.activate(one, { fresh: true });
    ash.adoptRoute('fallback');
    // Misty's client first appears on a plain switch, as after a relaunch.
    const misty = pool.activate(two);
    expect(misty.activeRoute).toBe('fallback');
  });

  it("drops a removed account's client", () => {
    const { pool, created, one, two } = setup();
    pool.activate(one, { fresh: true });
    pool.activate(two, { fresh: true });
    const without = withoutAccount(two, 'id2');
    if (!without) throw new Error('expected an account to remain');
    pool.activate(without);
    // Adding Misty back makes a new client rather than reviving the old one.
    pool.activate(withAccount(without, { username: 'misty', password: 'starmie' }, () => 'id3'));
    expect(created.map((c) => c.credentials.username)).toEqual(['ash', 'misty', 'misty']);
  });

  it('retires every client when the server changes', () => {
    const { pool, created, two } = setup();
    pool.activate(two, { fresh: true });
    const changed = { ...two, server: { ...two.server, accessClientSecret: 'rotated' } };
    const client = pool.activate(withActive(changed, 'id1'));
    expect(client.accessHeaders['CF-Access-Client-Secret']).toBe('rotated');
    expect(created.map((c) => c.credentials.username)).toEqual(['misty', 'ash']);
  });
});
