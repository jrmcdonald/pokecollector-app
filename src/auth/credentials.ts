/**
 * The server and account the app signs in to, kept in the iOS Keychain.
 *
 * One Keychain item holding JSON rather than one per field, so a save is
 * atomic: a half-written set of credentials is worse than the old set.
 * Nothing here is ever written anywhere else — not AsyncStorage, not the
 * query cache, not logs.
 */
import * as SecureStore from 'expo-secure-store';

import type { ServerCredentials } from '@/api/client';

const KEY = 'pokecollector.credentials.v2';

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable once the phone has been unlocked after boot, so background
  // refreshes work; never synced to other devices through iCloud Keychain.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function loadCredentials(): Promise<ServerCredentials | null> {
  const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ServerCredentials>;
    if (
      typeof value.primaryUrl === 'string' &&
      (value.fallbackUrl === null || typeof value.fallbackUrl === 'string') &&
      typeof value.accessClientId === 'string' &&
      typeof value.accessClientSecret === 'string' &&
      typeof value.username === 'string' &&
      typeof value.password === 'string'
    ) {
      return value as ServerCredentials;
    }
  } catch {
    // Fall through: unreadable credentials are no credentials.
  }
  return null;
}

export async function saveCredentials(credentials: ServerCredentials): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(credentials), OPTIONS);
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}

/** What the connection form holds: every field as typed, the fallback possibly blank. */
export type CredentialsInput = Omit<ServerCredentials, 'fallbackUrl'> & { fallbackUrl: string };

export function toInput(credentials: ServerCredentials): CredentialsInput {
  return { ...credentials, fallbackUrl: credentials.fallbackUrl ?? '' };
}

/**
 * Trims what a person types or pastes, and reduces each URL to its origin.
 * Returns an error message instead when something is unusable.
 */
export function normaliseCredentials(
  input: CredentialsInput,
): { ok: true; value: ServerCredentials } | { ok: false; error: string } {
  const primary = normaliseUrl(input.primaryUrl, 'primary');
  if (!primary.ok) return primary;
  const fallback = input.fallbackUrl.trim() ? normaliseUrl(input.fallbackUrl, 'fallback') : null;
  if (fallback && !fallback.ok) return fallback;

  const accessClientId = input.accessClientId.trim();
  const accessClientSecret = input.accessClientSecret.trim();
  const username = input.username.trim();
  if (!accessClientId || !accessClientSecret) {
    return { ok: false, error: 'Both parts of the Cloudflare service token are required.' };
  }
  if (!username || !input.password) {
    return { ok: false, error: 'A PokeCollector username and password are required.' };
  }
  return {
    ok: true,
    value: {
      primaryUrl: primary.url,
      // The same address twice is one address.
      fallbackUrl: fallback && fallback.url !== primary.url ? fallback.url : null,
      accessClientId,
      accessClientSecret,
      username,
      // Passwords may legitimately start or end with a space.
      password: input.password,
    },
  };
}

function normaliseUrl(
  raw: string,
  which: 'primary' | 'fallback',
): { ok: true; url: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: `The ${which} server address is required.` };
  let url: URL;
  try {
    url = new URL(text.includes('://') ? text : `https://${text}`);
  } catch {
    return { ok: false, error: `The ${which} server address is not a valid URL.` };
  }
  // iOS refuses plain http outside a development build anyway (App Transport
  // Security), and the password travels on these requests.
  if (url.protocol !== 'https:') {
    return { ok: false, error: `The ${which} server address must use https.` };
  }
  return { ok: true, url: `${url.protocol}//${url.host}` };
}
