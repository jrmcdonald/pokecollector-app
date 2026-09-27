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
import { clearCredentials, loadCredentials, saveCredentials } from '@/auth/credentials';

// expo/fetch rather than React Native's global fetch: the global one is built
// on XMLHttpRequest and ignores `redirect: 'manual'`, which is how the client
// tells an Access login redirect apart from a real response.
const nativeFetch: FetchLike = (url, init) => expoFetch(url, init);

export function createClient(credentials: ServerCredentials): PokeCollectorClient {
  return new PokeCollectorClient(credentials, nativeFetch);
}

type Session =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; credentials: ServerCredentials; client: PokeCollectorClient };

interface SessionContextValue {
  session: Session;
  /** Saves verified credentials to the Keychain and starts using them. */
  signIn(credentials: ServerCredentials): Promise<void>;
  /** Wipes the Keychain entry. The caller clears cached data. */
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadCredentials()
      .catch(() => null)
      .then((credentials) => {
        if (cancelled) return;
        setSession(
          credentials
            ? { status: 'signedIn', credentials, client: createClient(credentials) }
            : { status: 'signedOut' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (credentials: ServerCredentials) => {
    await saveCredentials(credentials);
    setSession({ status: 'signedIn', credentials, client: createClient(credentials) });
  }, []);

  const signOut = useCallback(async () => {
    await clearCredentials();
    setSession({ status: 'signedOut' });
  }, []);

  const client = session.status === 'signedIn' ? session.client : null;
  useEffect(() => (client ? watchNetwork(client) : undefined), [client]);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

/** The client, for screens that only render when signed in. */
export function useClient(): PokeCollectorClient {
  const { session } = useSession();
  if (session.status !== 'signedIn') {
    throw new Error('useClient called while signed out; the router guard should prevent this');
  }
  return session.client;
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
  const route = useSyncExternalStore(
    (listener) => (client ? client.subscribeToRoute(listener) : () => undefined),
    () => client?.activeRoute ?? null,
  );
  return { route, url: client && route ? client.activeBaseUrl : null };
}
