import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state that follows the person's pull only. Tying the
 * spinner to a query's `isRefetching` also shows it for background refreshes
 * (after an edit elsewhere, say), and iOS can leave it stuck at the top of a
 * screen navigated away from mid-refresh.
 */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  return { refreshing, onRefresh };
}
