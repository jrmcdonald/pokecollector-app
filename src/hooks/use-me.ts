import { useQuery } from '@tanstack/react-query';

import { getMe } from '@/api/endpoints';
import { useSession } from '@/session/session';

export function useMe() {
  const { session, getClient } = useSession();
  const cacheId = session.status === 'signedIn' ? session.cacheId : null;
  return useQuery({
    queryKey: [cacheId, 'me'],
    queryFn: () => getMe(getClient()),
    enabled: cacheId !== null,
  });
}
