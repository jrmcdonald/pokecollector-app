/**
 * The connection test onboarding and Settings run before saving anything.
 *
 * Each configured address is tested on its own, in two steps so a failure
 * says which half is wrong: Access (the service token) or PokeCollector (the
 * account). An address that does not answer at all is allowed, as long as the
 * other one passes: set up away from home, the home address is unreachable
 * by design, and it is still the right thing to save.
 */
import type { PokeCollectorClient, Route, ServerCredentials } from './client';
import { getAuthMode, getMe } from './endpoints';
import { ApiError, NetworkError } from './errors';
import type { User } from './schemas';

/** Long enough for a slow tunnel, short enough that an unreachable address doesn't stall setup. */
const VERIFY_TIMEOUT_MS = 8_000;

type Step = 'unreachable' | 'access' | 'account';

type AddressResult =
  { ok: true; user: User; token: string | null } | { ok: false; step: Step; message: string };

export type VerifyResult =
  /** `token` is the JWT from the test's login, valid on either address, so the app need not log in again. */
  | { ok: true; user: User; token: string | null; notes: string[] }
  | { ok: false; route: Route | null; step: Step; message: string };

export async function verifyConnection(
  credentials: ServerCredentials,
  makeClient: (credentials: ServerCredentials) => PokeCollectorClient,
): Promise<VerifyResult> {
  const addresses: [Route, string][] = [['primary', credentials.primaryUrl]];
  if (credentials.fallbackUrl) addresses.push(['fallback', credentials.fallbackUrl]);

  // In parallel: they are different paths to the server, so they don't share
  // a rate limit budget, and an unreachable one shouldn't add its timeout.
  const results = await Promise.all(
    addresses.map(async ([route, url]) => {
      const client = makeClient({ ...credentials, primaryUrl: url, fallbackUrl: null });
      return [route, await verifyAddress(client)] as const;
    }),
  );

  const failed = results.find(([, result]) => !result.ok && result.step !== 'unreachable');
  if (failed && !failed[1].ok) {
    return { ok: false, route: failed[0], step: failed[1].step, message: failed[1].message };
  }

  const passed = results.find(([, result]) => result.ok);
  if (!passed || !passed[1].ok) {
    const [, first] = results[0] ?? [];
    return {
      ok: false,
      route: null,
      step: 'unreachable',
      message:
        results.length > 1
          ? 'Neither address answered. Check them, and that this phone has a connection.'
          : `The server did not answer. ${first && !first.ok ? first.message : ''}`.trim(),
    };
  }

  const notes = results
    .filter(([, result]) => !result.ok)
    .map(
      ([route]) =>
        `The ${route} address did not answer from this network. It is saved anyway, ` +
        'and the app will use it whenever it can reach it.',
    );
  return { ok: true, user: passed[1].user, token: passed[1].token, notes };
}

async function verifyAddress(client: PokeCollectorClient): Promise<AddressResult> {
  try {
    const mode = await getAuthMode(client, { timeoutMs: VERIFY_TIMEOUT_MS });
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
    return {
      ok: false,
      step: error instanceof NetworkError ? 'unreachable' : 'access',
      message: describe(error),
    };
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
    return { ok: true, user, token: client.sessionToken };
  } catch (error) {
    return { ok: false, step: 'account', message: describe(error) };
  }
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
