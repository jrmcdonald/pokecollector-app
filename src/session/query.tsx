/**
 * TanStack Query, with its cache persisted so the last-seen data shows
 * offline and on a cold start.
 *
 * Defaults lean hard towards fewer requests: the backend allows 60 a minute
 * per IP, and every external client behind the tunnel shares one IP.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';

import { ProxyError, AuthError, RateLimitError } from '@/api/errors';

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

/**
 * Every request is sent at least once, whatever NetInfo says; only retries
 * wait for a connection. With TanStack's default ("online"), a query or
 * mutation started while NetInfo reports no connection is paused without
 * ever being sent, and stays paused until NetInfo reports one again. iOS can
 * miss that notification (the Simulator does when its host's network
 * changes), which left screens on "Loading" for good. And the server is often
 * on the home network, where iOS's idea of "connected" is beside the point:
 * sending is the only real test. A failed send while offline pauses the
 * retries, so being offline still costs at most one request.
 */
export const NETWORK_MODE = 'offlineFirst';

const ONE_DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: NETWORK_MODE,
      staleTime: 5 * 60 * 1000,
      gcTime: 7 * ONE_DAY,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying these cannot help: they need the user, or time.
        if (error instanceof ProxyError || error instanceof AuthError) return false;
        if (error instanceof RateLimitError) return failureCount < 1;
        return failureCount < 2;
      },
      retryDelay: (attempt, error) =>
        error instanceof RateLimitError && error.retryAfter
          ? error.retryAfter * 1000
          : Math.min(1000 * 2 ** attempt, 15_000),
    },
    mutations: { networkMode: NETWORK_MODE, retry: false },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'pokecollector.query-cache.v1',
  throttleTime: 2000,
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * ONE_DAY, buster: 'pokecollector-1.51.0' }}>
      {children}
    </PersistQueryClientProvider>
  );
}

/** Drops cached server data, in memory and on disk. For sign-out and "clear cache". */
export async function clearQueryCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
