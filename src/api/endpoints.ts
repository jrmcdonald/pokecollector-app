import type { PokeCollectorClient } from './client';
import { AuthModeSchema, UserSchema, type AuthMode, type User } from './schemas';

export function getAuthMode(client: PokeCollectorClient): Promise<AuthMode> {
  return client.requestAnonymous('/api/auth/mode', { schema: AuthModeSchema });
}

export function getMe(client: PokeCollectorClient): Promise<User> {
  return client.request('/api/auth/me', { schema: UserSchema });
}
