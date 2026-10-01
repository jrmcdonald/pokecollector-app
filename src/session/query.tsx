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

const ONE_DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
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
    mutations: { retry: false },
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
