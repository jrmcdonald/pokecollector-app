/**
 * Who the app is signed in as, and the API client for that account.
 *
 * The server and accounts live in the Keychain (src/auth/credentials.ts);
 * this holds them in memory and hands every screen the active account's
 * client, so the single in-flight login in PokeCollectorClient is actually
 * shared. Each account keeps its own client, and with it its own token, for
 * as long as the app runs: switching back to an account costs no login.
 */
import NetInfo from '@react-native-community/netinfo';
import { fetch as expoFetch } from 'expo/fetch';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import {
  PokeCollectorClient,
  type FetchLike,
  type Route,
  type ServerCredentials,
} from '@/api/client';
import {
  activeAccount,
  credentialsFor,
  withAccount,
  withActive,
  withCredentials,
  withoutAccount,
  type StoredState,
} from '@/auth/accounts';
import { clearCredentials, loadState, newCacheId, saveState } from '@/auth/credentials';

import { ClientPool } from './client-pool';

// expo/fetch rather than React Native's global fetch: the global one is built
// on XMLHttpRequest and ignores `redirect: 'manual'`, which is how the client
// tells a proxy's login redirect apart from a real response.
const nativeFetch: FetchLike = (url, init) => expoFetch(url, init);

export function createClient(credentials: ServerCredentials, token?: string): PokeCollectorClient {
  return new PokeCollectorClient(credentials, nativeFetch, { token });
}

/** An account as screens see it: no password. */
export interface AccountSummary {
  id: string;
  username: string;
}

type Session =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | {
      status: 'signedIn';
      /** The server with the active account's login. */
      credentials: ServerCredentials;
      client: PokeCollectorClient;
      /** The active account's id: opaque, and the root of every query key. */
      cacheId: string;
      accounts: AccountSummary[];
    };

interface SessionContextValue {
  session: Session;
  /**
   * The current client, read at call time. Query functions use this rather
   * than a client captured at render: TanStack Query swaps in a new queryFn
   * only after a render, so a refetch started straight after a sign-in or a
   * switch would otherwise run with the old account.
   */
  getClient(): PokeCollectorClient;
  /**
   * Saves a verified server and login (onboarding, and the connection form
   * in Settings) and starts using them. Pass the token the connection test
   * obtained, to save a login. A different server forgets the other accounts.
   */
  signIn(credentials: ServerCredentials, token?: string): Promise<void>;
  /** Adds a verified account on the saved server and switches to it. */
  addAccount(login: { username: string; password: string }, token?: string): Promise<void>;
  switchAccount(id: string): Promise<void>;
  /**
   * Removes an account other than the last. The caller removes its cached
   * queries.
   */
  removeAccount(id: string): Promise<void>;
  /** Wipes the Keychain entry. The caller clears cached data. */
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const stateRef = useRef<StoredState | null>(null);
  const [pool] = useState(() => new ClientPool(createClient));

  /** Makes `state` current: its active account's client, then the session. */
  const apply = useCallback(
    (state: StoredState | null, options: { fresh?: boolean; token?: string } = {}) => {
      stateRef.current = state;
      if (!state) {
        pool.clear();
        setSession({ status: 'signedOut' });
        return;
      }
      const account = activeAccount(state);
      setSession({
        status: 'signedIn',
        credentials: credentialsFor(state.server, account),
        client: pool.activate(state, options),
        cacheId: account.id,
        accounts: state.accounts.map(({ id, username }) => ({ id, username })),
      });
    },
    [pool],
  );

  useEffect(() => {
    let cancelled = false;
    loadState()
      .catch(() => null)
      .then((stored) => {
        if (!cancelled) apply(stored);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const signIn = useCallback(
    async (credentials: ServerCredentials, token?: string) => {
      const next = withCredentials(stateRef.current, credentials, newCacheId);
      await saveState(next);
      // The login or the server may have changed, so the active account
      // always gets a new client (see ClientPool.activate).
      apply(next, { fresh: true, token });
    },
    [apply],
  );

  const addAccount = useCallback(
    async (login: { username: string; password: string }, token?: string) => {
      const current = stateRef.current;
      if (!current) throw new Error('Not signed in');
      const next = withAccount(current, login, newCacheId);
      await saveState(next);
      apply(next, { fresh: true, token });
    },
    [apply],
  );

  const switchAccount = useCallback(
    async (id: string) => {
      const current = stateRef.current;
      if (!current || current.activeId === id) return;
      const next = withActive(current, id);
      await saveState(next);
      apply(next);
    },
    [apply],
  );

  const removeAccount = useCallback(
    async (id: string) => {
      const current = stateRef.current;
      if (!current) return;
      const next = withoutAccount(current, id);
      if (!next) throw new Error('The last account cannot be removed; sign out instead.');
      await saveState(next);
      apply(next);
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    await clearCredentials();
    apply(null);
  }, [apply]);

  const getClient = useCallback(() => {
    const client = pool.active;
    if (!client) throw new Error('Not signed in');
    return client;
  }, [pool]);

  const client = session.status === 'signedIn' ? session.client : null;
  useEffect(() => (client ? watchNetwork(client) : undefined), [client]);

  const value = useMemo(
    () => ({ session, getClient, signIn, addAccount, switchAccount, removeAccount, signOut }),
    [session, getClient, signIn, addAccount, switchAccount, removeAccount, signOut],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

/**
 * Re-picks between the primary and fallback addresses when it might now be
 * wrong: on any change of network (leaving home Wi-Fi for cellular, or
 * arriving back), and on returning to the foreground while on the fallback,
 * in case home came back while the app was suspended. Re-picking is lazy:
 * the next request probes, so this costs nothing when nothing is fetched.
 */
function watchNetwork(client: PokeCollectorClient): () => void {
  let lastNetwork: string | null = null;
  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    // Type and address, not the whole details object: signal strength and the
    // like fluctuate without the route changing.
    const address = state.details && 'ipAddress' in state.details ? state.details.ipAddress : null;
    const network = `${state.type}:${state.isConnected}:${address}`;
    if (lastNetwork !== null && network !== lastNetwork) client.invalidateRoute();
    lastNetwork = network;
  });
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active' && client.activeRoute === 'fallback') client.invalidateRoute();
  });
  return () => {
    unsubscribeNetInfo();
    appState.remove();
  };
}

/** Which address requests are going to, for display. Null until the first request. */
export function useActiveRoute(): { route: Route | null; url: string | null } {
  const { session } = useSession();
  const client = session.status === 'signedIn' ? session.client : null;
  const subscribe = useCallback(
    (listener: () => void) => (client ? client.subscribeToRoute(listener) : () => undefined),
    [client],
  );
  const route = useSyncExternalStore(subscribe, () => client?.activeRoute ?? null);
  return { route, url: client && route ? client.activeBaseUrl : null };
}
