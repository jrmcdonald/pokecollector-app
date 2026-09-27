import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';

import { useSession } from '@/session/session';
import { pick } from '@/utils/pick';

/**
 * The action sheet behind the account name on Home: switch to another saved
 * account, add one, or open Settings. A switch shows the other account's
 * cached screens at once and refreshes them in the background.
 */
export function useAccountMenu(): () => Promise<void> {
  const { session, switchAccount } = useSession();
  return async () => {
    if (session.status !== 'signedIn') return;
    const { accounts, cacheId } = session;
    const labels = accounts.map((a) => (a.id === cacheId ? `${a.username} (current)` : a.username));
    const index = await pick(accounts.length > 1 ? 'Switch account' : 'Account', [
      ...labels,
      'Add an account',
      'Settings',
    ]);
    if (index === null) return;
    const account = accounts[index];
    if (account) {
      if (account.id === cacheId) return;
      try {
        await switchAccount(account.id);
        Haptics.selectionAsync().catch(() => undefined);
      } catch (error) {
        Alert.alert('Could not switch', error instanceof Error ? error.message : String(error));
      }
      return;
    }
    router.push(index === accounts.length ? '/add-account' : '/settings');
  };
}
