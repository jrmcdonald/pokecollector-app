import { useQuery } from '@tanstack/react-query';

import { getMe } from '@/api/endpoints';
import { useSession } from '@/session/session';

export function useMe() {
  const { session } = useSession();
  const signedIn = session.status === 'signedIn';
  return useQuery({
    queryKey: [
      'me',
      signedIn ? session.credentials.baseUrl : null,
      signedIn ? session.credentials.username : null,
    ],
    queryFn: () => {
      if (!signedIn) throw new Error('Not signed in');
      return getMe(session.client);
    },
    enabled: signedIn,
  });
}
