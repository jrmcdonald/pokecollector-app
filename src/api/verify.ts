/**
 * The connection test onboarding and Settings run, in two steps so a failure
 * says which half is wrong: Access (the service token) or PokeCollector (the
 * account).
 */
import type { PokeCollectorClient } from './client';
import { getAuthMode, getMe } from './endpoints';
import { ApiError } from './errors';
import type { User } from './schemas';

export type VerifyResult =
  { ok: true; user: User } | { ok: false; step: 'access' | 'account'; message: string };

export async function verifyConnection(client: PokeCollectorClient): Promise<VerifyResult> {
  try {
    const mode = await getAuthMode(client);
    if (!mode.multi_user) {
      // Single-user mode hands the admin account to anyone who reaches it.
      // The addon defaults to multi and warns otherwise; the app refuses.
      return {
        ok: false,
        step: 'account',
        message:
          'This PokeCollector runs in single-user mode, with its login screen off. ' +
          "Set the addon's user_mode to multi first.",
      };
    }
  } catch (error) {
    return { ok: false, step: 'access', message: describe(error) };
  }

  try {
    const user = await getMe(client);
    if (user.must_change_password) {
      return {
        ok: false,
        step: 'account',
        message:
          'PokeCollector requires a new password for this account. Change it in the web UI first.',
      };
    }
    return { ok: true, user };
  } catch (error) {
    return { ok: false, step: 'account', message: describe(error) };
  }
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
