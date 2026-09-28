/**
 * Several PokeCollector accounts on one server: the stored shape and the
 * changes made to it. Pure functions, so every rule here is unit-tested;
 * `credentials.ts` does the Keychain reads and writes.
 *
 * The server (addresses and service token) is shared. Each account has its
 * own login and an opaque id that doubles as the root of its query keys, so
 * each account's cached data stays apart and switching back shows it at once.
 */
import type { ServerCredentials } from '@/api/client';

export interface ServerConfig {
  primaryUrl: string;
  fallbackUrl: string | null;
  accessClientId: string;
  accessClientSecret: string;
}

export interface Account {
  /** Opaque and stable: the root of this account's query keys. */
  id: string;
  username: string;
  password: string;
}

export interface StoredState {
  server: ServerConfig;
  /** Never empty. */
  accounts: Account[];
  activeId: string;
}

export function serverOf(credentials: ServerCredentials): ServerConfig {
  const { primaryUrl, fallbackUrl, accessClientId, accessClientSecret } = credentials;
  return { primaryUrl, fallbackUrl, accessClientId, accessClientSecret };
}

export function credentialsFor(server: ServerConfig, account: Account): ServerCredentials {
  return { ...server, username: account.username, password: account.password };
}

/** The active account; the first if the stored id is somehow missing. */
export function activeAccount(state: StoredState): Account {
  const found = state.accounts.find((a) => a.id === state.activeId) ?? state.accounts[0];
  if (!found) throw new Error('No accounts');
  return found;
}

/**
 * Onboarding and the Settings connection form: save a server and the login
 * to use on it.
 *
 * - A different server (primary address) starts again with this one account:
 *   the other accounts belonged to the old server.
 * - The same server updates the addresses and token, and the active account's
 *   login. A different username there switches to that account if it is
 *   already saved, and otherwise replaces the active account with a new one.
 */
export function withCredentials(
  state: StoredState | null,
  credentials: ServerCredentials,
  newId: () => string,
): StoredState {
  const server = serverOf(credentials);
  const login = { username: credentials.username, password: credentials.password };
  if (!state || state.server.primaryUrl !== server.primaryUrl) {
    const account = { id: newId(), ...login };
    return { server, accounts: [account], activeId: account.id };
  }
  const active = activeAccount(state);
  if (active.username === login.username) {
    return {
      server,
      accounts: state.accounts.map((a) => (a.id === active.id ? { ...a, ...login } : a)),
      activeId: active.id,
    };
  }
  const existing = state.accounts.find((a) => a.username === login.username);
  if (existing) {
    return {
      server,
      accounts: state.accounts.map((a) => (a.id === existing.id ? { ...a, ...login } : a)),
      activeId: existing.id,
    };
  }
  const replacement = { id: newId(), ...login };
  return {
    server,
    accounts: state.accounts.map((a) => (a.id === active.id ? replacement : a)),
    activeId: replacement.id,
  };
}

/**
 * Adds an account on the saved server and makes it active. A username that
 * is already saved updates that account's password instead of duplicating it.
 */
export function withAccount(
  state: StoredState,
  login: { username: string; password: string },
  newId: () => string,
): StoredState {
  const existing = state.accounts.find((a) => a.username === login.username);
  if (existing) {
    return {
      ...state,
      accounts: state.accounts.map((a) => (a.id === existing.id ? { ...a, ...login } : a)),
      activeId: existing.id,
    };
  }
  const account = { id: newId(), ...login };
  return { ...state, accounts: [...state.accounts, account], activeId: account.id };
}

export function withActive(state: StoredState, id: string): StoredState {
  if (!state.accounts.some((a) => a.id === id)) return state;
  return { ...state, activeId: id };
}

/**
 * Removes an account. The last one cannot be removed this way (that is
 * signing out), so this returns null for it. Removing the active account
 * makes the first remaining one active.
 */
export function withoutAccount(state: StoredState, id: string): StoredState | null {
  const accounts = state.accounts.filter((a) => a.id !== id);
  const first = accounts[0];
  if (!first) return null;
  return {
    ...state,
    accounts,
    activeId: state.activeId === id ? first.id : state.activeId,
  };
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isServer(v: unknown): v is ServerConfig {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    isString(s.primaryUrl) &&
    (s.fallbackUrl === null || isString(s.fallbackUrl)) &&
    isString(s.accessClientId) &&
    isString(s.accessClientSecret)
  );
}

function isAccount(v: unknown): v is Account {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return isString(a.id) && isString(a.username) && isString(a.password);
}

/** Reads the stored JSON, or null if it is missing or unusable. */
export function parseState(raw: string | null): StoredState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const accounts = value.accounts;
    if (
      isServer(value.server) &&
      Array.isArray(accounts) &&
      accounts.length > 0 &&
      accounts.every(isAccount) &&
      isString(value.activeId)
    ) {
      const state = { server: value.server, accounts, activeId: value.activeId };
      return { ...state, activeId: activeAccount(state).id };
    }
  } catch {
    // Fall through: unreadable is the same as missing.
  }
  return null;
}

/**
 * The single-account format (v3): `{ credentials, cacheId }`. Its cache id
 * becomes the account's id, so the data cached before the upgrade is kept.
 */
export function parseV3(raw: string | null): StoredState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { credentials?: Record<string, unknown>; cacheId?: unknown };
    const c = value.credentials;
    if (
      c &&
      isString(value.cacheId) &&
      isServer(c) &&
      isString(c.username) &&
      isString(c.password)
    ) {
      const account = { id: value.cacheId, username: c.username, password: c.password };
      return {
        server: {
          primaryUrl: c.primaryUrl,
          fallbackUrl: c.fallbackUrl,
          accessClientId: c.accessClientId,
          accessClientSecret: c.accessClientSecret,
        },
        accounts: [account],
        activeId: account.id,
      };
    }
  } catch {
    // Fall through.
  }
  return null;
}
