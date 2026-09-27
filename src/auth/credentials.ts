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

const KEY = 'pokecollector.credentials.v1';

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
      typeof value.baseUrl === 'string' &&
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

/**
 * Trims what a person types or pastes, and reduces the URL to its origin.
 * Returns an error message instead when something is unusable.
 */
export function normaliseCredentials(
  input: ServerCredentials,
): { ok: true; value: ServerCredentials } | { ok: false; error: string } {
  const trimmed = {
    baseUrl: input.baseUrl.trim(),
    accessClientId: input.accessClientId.trim(),
    accessClientSecret: input.accessClientSecret.trim(),
    username: input.username.trim(),
    // Passwords may legitimately start or end with a space.
    password: input.password,
  };
  let url: URL;
  try {
    url = new URL(trimmed.baseUrl.includes('://') ? trimmed.baseUrl : `https://${trimmed.baseUrl}`);
  } catch {
    return { ok: false, error: 'The server address is not a valid URL.' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: 'The server address must use https.' };
  }
  if (!trimmed.accessClientId || !trimmed.accessClientSecret) {
    return { ok: false, error: 'Both parts of the Cloudflare service token are required.' };
  }
  if (!trimmed.username || !trimmed.password) {
    return { ok: false, error: 'A PokeCollector username and password are required.' };
  }
  return { ok: true, value: { ...trimmed, baseUrl: `${url.protocol}//${url.host}` } };
}
