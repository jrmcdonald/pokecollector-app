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

const KEY = 'pokecollector.credentials.v3';

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable once the phone has been unlocked after boot, so background
  // refreshes work; never synced to other devices through iCloud Keychain.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * What is saved: the credentials, plus an opaque id for this server and
 * account. Query keys use the id, never the address or username, because the
 * query cache is persisted to AsyncStorage, which is neither encrypted nor
 * kept out of backups.
 */
export interface StoredSession {
  credentials: ServerCredentials;
  cacheId: string;
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as {
      credentials?: Partial<ServerCredentials>;
      cacheId?: unknown;
    };
    const c = value.credentials;
    if (
      c &&
      typeof value.cacheId === 'string' &&
      typeof c.primaryUrl === 'string' &&
      (c.fallbackUrl === null || typeof c.fallbackUrl === 'string') &&
      typeof c.accessClientId === 'string' &&
      typeof c.accessClientSecret === 'string' &&
      typeof c.username === 'string' &&
      typeof c.password === 'string'
    ) {
      return { credentials: c as ServerCredentials, cacheId: value.cacheId };
    }
  } catch {
    // Fall through: unreadable credentials are no credentials.
  }
  return null;
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session), OPTIONS);
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}

/** Whether two sets of credentials are the same account on the same server. */
export function sameAccount(a: ServerCredentials, b: ServerCredentials): boolean {
  return a.primaryUrl === b.primaryUrl && a.username === b.username;
}

/** A fresh opaque id. Not a secret, only a cache key, so Math.random is enough. */
export function newCacheId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
  // Optional, for a server without Cloudflare Access in front; but half a
  // token is always a mistake.
  if (!accessClientId !== !accessClientSecret) {
    return {
      ok: false,
      error: 'Enter both parts of the Cloudflare service token, or neither.',
    };
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
