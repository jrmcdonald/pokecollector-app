/**
 * One API client per account, kept for as long as the app runs, so each
 * account holds its own token and switching back to one costs no login.
 */
import type { PokeCollectorClient, ServerCredentials } from '@/api/client';
import { activeAccount, credentialsFor, type StoredState } from '@/auth/accounts';

type Factory = (credentials: ServerCredentials, token?: string) => PokeCollectorClient;

export class ClientPool {
  private readonly clients = new Map<string, PokeCollectorClient>();
  private server: string | null = null;
  private current: PokeCollectorClient | null = null;

  constructor(private readonly create: Factory) {}

  /** The active account's client, or null when signed out. */
  get active(): PokeCollectorClient | null {
    return this.current;
  }

  /**
   * Makes `state`'s active account current and returns its client.
   *
   * - `fresh` builds a new client for it even if one exists: its login or the
   *   server changed. A fresh client probes for its route itself.
   * - Otherwise an existing client is reused, and a new one takes the route
   *   the previous account's client already picked: the route belongs to the
   *   server, not the account.
   * - Clients for removed accounts go, and all of them go when anything about
   *   the server (addresses or service token) changes.
   */
  activate(
    state: StoredState,
    options: { fresh?: boolean; token?: string } = {},
  ): PokeCollectorClient {
    const server = JSON.stringify(state.server);
    if (server !== this.server) {
      this.clients.clear();
      this.server = server;
    }
    for (const id of [...this.clients.keys()]) {
      if (!state.accounts.some((a) => a.id === id)) this.clients.delete(id);
    }

    const account = activeAccount(state);
    const previous = this.current;
    let client = options.fresh ? undefined : this.clients.get(account.id);
    if (!client) {
      client = this.create(credentialsFor(state.server, account), options.token);
      this.clients.set(account.id, client);
      if (!options.fresh && previous && !client.activeRoute) {
        client.adoptRoute(previous.activeRoute);
      }
    }
    this.current = client;
    return client;
  }

  clear(): void {
    this.clients.clear();
    this.server = null;
    this.current = null;
  }
}
