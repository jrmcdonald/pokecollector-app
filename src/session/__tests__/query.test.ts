import { MutationObserver, QueryObserver, onlineManager } from '@tanstack/react-query';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => {}) },
}));

// eslint-disable-next-line import/first
import { queryClient } from '../query';

describe('the query client while iOS reports no connection', () => {
  beforeEach(() => onlineManager.setOnline(false));
  afterEach(() => {
    onlineManager.setOnline(true);
    queryClient.clear();
  });

  it('still sends a query once', async () => {
    const queryFn = jest.fn(async () => 'card');
    const observer = new QueryObserver(queryClient, { queryKey: ['card', 'sv2-254'], queryFn });
    const unsubscribe = observer.subscribe(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().data).toBe('card');
    unsubscribe();
  });

  it('still sends a mutation once', async () => {
    const mutationFn = jest.fn(async () => 'added');
    const observer = new MutationObserver(queryClient, { mutationFn });
    // Not awaited: a paused mutation would never settle.
    void observer.mutate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it('waits for a connection before retrying a failed query', async () => {
    const queryFn = jest.fn(async () => {
      throw new Error('offline');
    });
    const observer = new QueryObserver(queryClient, {
      queryKey: ['card', 'sv1-001'],
      queryFn,
      retryDelay: 0,
    });
    const unsubscribe = observer.subscribe(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().fetchStatus).toBe('paused');
    unsubscribe();
  });
});
