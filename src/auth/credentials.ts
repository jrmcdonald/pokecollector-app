/**
 * The server and accounts the app signs in to, kept in the iOS Keychain.
 *
 * One Keychain item holding JSON rather than one per field, so a save is
 * atomic: a half-written set of credentials is worse than the old set.
 * Nothing here is ever written anywhere else — not AsyncStorage, not the
 * query cache, not logs. The shape and its rules are in `accounts.ts`.
 */
import * as SecureStore from 'expo-secure-store';

import type { ServerCredentials } from '@/api/client';
import {
  headerProblem,
  MAX_PROXY_HEADERS,
  NO_PROXY,
  type ProxyAuth,
  type ProxyHeader,
} from '@/api/proxy';

import { parseState, parseV3, type StoredState } from './accounts';

/** Several accounts on one server, behind any kind of proxy. */
const KEY = 'pokecollector.credentials.v5';
/** Earlier formats, read once to migrate, then deleted. v4 assumed Cloudflare. */
const V4_KEY = 'pokecollector.credentials.v4';
const V3_KEY = 'pokecollector.credentials.v3';

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable once the phone has been unlocked after boot, so background
  // refreshes work; never synced to other devices through iCloud Keychain.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * The saved server and accounts. Account ids are opaque and are what query
 * keys use, never the address or username, because the query cache is
 * persisted to AsyncStorage, which is neither encrypted nor kept out of
 * backups.
 */
export async function loadState(): Promise<StoredState | null> {
  const current = parseState(await SecureStore.getItemAsync(KEY, OPTIONS));
  if (current) return current;
  const migrated =
    parseState(await SecureStore.getItemAsync(V4_KEY, OPTIONS)) ??
    parseV3(await SecureStore.getItemAsync(V3_KEY, OPTIONS));
  if (!migrated) return null;
  // Write the new format before deleting the old, so a crash in between
  // loses nothing.
  await saveState(migrated);
  await SecureStore.deleteItemAsync(V4_KEY, OPTIONS);
  await SecureStore.deleteItemAsync(V3_KEY, OPTIONS);
  return migrated;
}

export async function saveState(state: StoredState): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(state), OPTIONS);
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
  await SecureStore.deleteItemAsync(V4_KEY, OPTIONS);
  await SecureStore.deleteItemAsync(V3_KEY, OPTIONS);
}

/** Whether two sets of credentials are the same account on the same server. */
export function sameAccount(a: ServerCredentials, b: ServerCredentials): boolean {
  return a.primaryUrl === b.primaryUrl && a.username === b.username;
}

/** A fresh opaque id. Not a secret, only a cache key, so Math.random is enough. */
export function newCacheId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * What the connection form holds: every field as typed, the fallback possibly
 * blank, and the fields for every kind of proxy, so switching kinds and back
 * keeps what was typed. Only the chosen kind is saved.
 */
export interface CredentialsInput {
  primaryUrl: string;
  fallbackUrl: string;
  proxyKind: ProxyAuth['kind'];
  clientId: string;
  clientSecret: string;
  headers: ProxyHeader[];
  username: string;
  password: string;
}

export const EMPTY_INPUT: CredentialsInput = {
  primaryUrl: '',
  fallbackUrl: '',
  proxyKind: 'none',
  clientId: '',
  clientSecret: '',
  headers: [{ name: '', value: '' }],
  username: '',
  password: '',
};

export function toInput(credentials: ServerCredentials): CredentialsInput {
  const { proxy } = credentials;
  return {
    primaryUrl: credentials.primaryUrl,
    fallbackUrl: credentials.fallbackUrl ?? '',
    proxyKind: proxy.kind,
    clientId: proxy.kind === 'cloudflare' ? proxy.clientId : '',
    clientSecret: proxy.kind === 'cloudflare' ? proxy.clientSecret : '',
    headers:
      proxy.kind === 'headers' && proxy.headers.length
        ? proxy.headers.map((h) => ({ ...h }))
        : EMPTY_INPUT.headers,
    username: credentials.username,
    password: credentials.password,
  };
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

  const proxy = normaliseProxy(input);
  if (!proxy.ok) return proxy;

  const username = input.username.trim();
  if (!username || !input.password) {
    return { ok: false, error: 'A PokeCollector username and password are required.' };
  }
  return {
    ok: true,
    value: {
      primaryUrl: primary.url,
      // The same address twice is one address.
      fallbackUrl: fallback && fallback.url !== primary.url ? fallback.url : null,
      proxy: proxy.value,
      username,
      // Passwords may legitimately start or end with a space.
      password: input.password,
    },
  };
}

function normaliseProxy(
  input: CredentialsInput,
): { ok: true; value: ProxyAuth } | { ok: false; error: string } {
  switch (input.proxyKind) {
    case 'none':
      return { ok: true, value: NO_PROXY };
    case 'cloudflare': {
      const clientId = input.clientId.trim();
      const clientSecret = input.clientSecret.trim();
      if (!clientId || !clientSecret) {
        return { ok: false, error: 'Enter both parts of the Cloudflare service token.' };
      }
      return { ok: true, value: { kind: 'cloudflare', clientId, clientSecret } };
    }
    case 'headers': {
      // A row left completely blank is one not used, not a mistake.
      const headers = input.headers
        .map((h) => ({ name: h.name.trim(), value: h.value.trim() }))
        .filter((h) => h.name || h.value);
      if (!headers.length) {
        return { ok: false, error: 'Add at least one header for the proxy, or choose None.' };
      }
      if (headers.length > MAX_PROXY_HEADERS) {
        return { ok: false, error: `Up to ${MAX_PROXY_HEADERS} proxy headers can be sent.` };
      }
      const seen = new Set<string>();
      for (const header of headers) {
        const problem = headerProblem(header);
        if (problem) return { ok: false, error: problem };
        const key = header.name.toLowerCase();
        if (seen.has(key)) return { ok: false, error: `${header.name} is there twice.` };
        seen.add(key);
      }
      return { ok: true, value: { kind: 'headers', headers } };
    }
  }
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
