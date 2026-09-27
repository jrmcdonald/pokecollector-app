/**
 * Who the app is signed in as, and the API client for that server.
 *
 * Credentials live in the Keychain (src/auth/credentials.ts); this holds them
 * in memory for the session and hands every screen the same client, so the
 * single in-flight login in PokeCollectorClient is actually shared.
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
  clearCredentials,
  loadSession,
  newCacheId,
  sameAccount,
  saveSession,
} from '@/auth/credentials';

// expo/fetch rather than React Native's global fetch: the global one is built
// on XMLHttpRequest and ignores `redirect: 'manual'`, which is how the client
// tells an Access login redirect apart from a real response.
const nativeFetch: FetchLike = (url, init) => expoFetch(url, init);

export function createClient(credentials: ServerCredentials, token?: string): PokeCollectorClient {
  return new PokeCollectorClient(credentials, nativeFetch, { token });
}

type Session =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | {
      status: 'signedIn';
      credentials: ServerCredentials;
      client: PokeCollectorClient;
      /** Opaque, stable per server and account: the root of every query key. */
      cacheId: string;
    };

interface SessionContextValue {
  session: Session;
  /**
   * The current client, read at call time. Query functions use this rather
   * than a client captured at render: TanStack Query swaps in a new queryFn
   * only after a render, so a refetch started straight after signIn would
   * otherwise run with the old credentials.
   */
  getClient(): PokeCollectorClient;
  /**
   * Saves verified credentials to the Keychain and starts using them. Pass
   * the token the connection test obtained, to save a login.
   */
  signIn(credentials: ServerCredentials, token?: string): Promise<void>;
  /** Wipes the Keychain entry. The caller clears cached data. */
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const clientRef = useRef<PokeCollectorClient | null>(null);
  const sessionRef = useRef<Session>(session);

  const apply = useCallback((next: Session) => {
    clientRef.current = next.status === 'signedIn' ? next.client : null;
    sessionRef.current = next;
    setSession(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSession()
      .catch(() => null)
      .then((stored) => {
        if (cancelled) return;
        apply(
          stored
            ? {
                status: 'signedIn',
                credentials: stored.credentials,
                client: createClient(stored.credentials),
                cacheId: stored.cacheId,
              }
            : { status: 'signedOut' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const signIn = useCallback(
    async (credentials: ServerCredentials, token?: string) => {
      const current = sessionRef.current;
      // Same account on the same server keeps its cached data; anything else
      // starts a fresh cache.
      const cacheId =
        current.status === 'signedIn' && sameAccount(current.credentials, credentials)
          ? current.cacheId
          : newCacheId();
      await saveSession({ credentials, cacheId });
      apply({
        status: 'signedIn',
        credentials,
        client: createClient(credentials, token),
        cacheId,
      });
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    await clearCredentials();
    apply({ status: 'signedOut' });
  }, [apply]);

  const getClient = useCallback(() => {
    if (!clientRef.current) throw new Error('Not signed in');
    return clientRef.current;
  }, []);

  const client = session.status === 'signedIn' ? session.client : null;
  useEffect(() => (client ? watchNetwork(client) : undefined), [client]);

  const value = useMemo(
    () => ({ session, getClient, signIn, signOut }),
    [session, getClient, signIn, signOut],
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
