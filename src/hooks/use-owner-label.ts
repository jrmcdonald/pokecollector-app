import { useSession } from '@/session/session';

/**
 * "ash's collection" when more than one account is saved, so an edit never
 * lands in the wrong one unnoticed; null with a single account.
 */
export function useOwnerLabel(): string | null {
  const { session } = useSession();
  if (session.status !== 'signedIn' || session.accounts.length < 2) return null;
  return `${session.credentials.username}’s collection`;
}
