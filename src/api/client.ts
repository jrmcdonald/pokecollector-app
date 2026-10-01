/**
 * The one place the app talks to PokeCollector.
 *
 * Two credentials ride on every request. Whatever the proxy in front of the
 * server wants (`proxy.ts`: nothing, a Cloudflare Access service token, or
 * headers of its own) gets it through; the PokeCollector JWT says whose
 * collection it is. Upstream
 * has no API tokens, so the JWT comes from POST /api/auth/login with the
 * username and password kept in the Keychain, and lasts seven days.
 *
 * Re-authentication follows pokecollector-mcp's client: upstream allows five
 * logins a minute per IP, and behind the tunnel every external client is one
 * IP. Several queries seeing a 401 at once must converge on one login, so each
 * hands back the token it used and only the first to arrive replaces it.
 *
 * A server can have two addresses: a primary, tried first (typically the one
 * that only works on the home network), and a fallback (typically the public
 * public one, behind a proxy). Both reach the same backend, so one JWT serves both.
 * See `resolveBaseUrl` for how the client picks between them.
 */
import type { z } from 'zod';

import {
  ProxyError,
  ApiError,
  AuthError,
  ConflictError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ResponseShapeError,
  ServerError,
  ValidationError,
} from './errors';
import { proxyHeaders, proxyRejection, type ProxyAuth } from './proxy';
import { AuthModeSchema, TokenResponseSchema } from './schemas';

export interface ServerCredentials {
  /** Origin only, e.g. https://pokecollector.home.example — tried first. */
  primaryUrl: string;
  /** Origin only, or null. Used when the primary does not answer. */
  fallbackUrl: string | null;
  /** What the proxy in front of the server wants, sent to both addresses. */
  proxy: ProxyAuth;
  username: string;
  password: string;
}

export type Route = 'primary' | 'fallback';

/** The subset of fetch the client uses, so tests can supply their own. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string | FormData;
    redirect: 'manual';
    credentials: 'omit';
    signal: AbortSignal;
  },
) => Promise<ResponseLike>;

export interface ResponseLike {
  status: number;
  redirected?: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  form?: FormData;
  /** Validates the body. Required for anything the app reads from. */
  schema?: z.ZodType<T>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * How long the primary gets to answer a probe before the fallback is tried.
 * Away from home a LAN-only name often resolves to a private address that
 * nothing answers, and the connection hangs rather than failing, so this is
 * what the user waits on when the app starts outside.
 */
export const PRIMARY_PROBE_TIMEOUT_MS = 3_000;

export class PokeCollectorClient {
  private token: string | null;
  private login: Promise<string> | null = null;
  /**
   * Set when the server rejects the password. Every later request fails with
   * it at once instead of trying again: upstream allows five logins a minute
   * per IP, and behind the tunnel that budget is shared with every browser.
   * Fixing the password in Settings builds a new client, which clears it.
   */
  private authFailure: AuthError | null = null;
  private route: Route | null = null;
  private resolving: Promise<Route> | null = null;
  /** Bumped by invalidateRoute, so a probe started before it cannot set the route after it. */
  private generation = 0;
  private readonly routeListeners = new Set<() => void>();

  constructor(
    private readonly credentials: ServerCredentials,
    private readonly fetchImpl: FetchLike,
    /** A token already obtained for these credentials, e.g. by the connection test. */
    options: { token?: string } = {},
  ) {
    this.token = options.token ?? null;
  }

  /** The current PokeCollector JWT, if signed in. Never persisted by this class. */
  get sessionToken(): string | null {
    return this.token;
  }

  /** The route in use, or null before the first request has picked one. */
  get activeRoute(): Route | null {
    return this.route;
  }

  /** The origin requests currently go to; the primary until a probe says otherwise. */
  get activeBaseUrl(): string {
    return this.urlFor(this.route ?? 'primary');
  }

  /** Notified whenever the route changes, including to null. */
  subscribeToRoute(listener: () => void): () => void {
    this.routeListeners.add(listener);
    return () => this.routeListeners.delete(listener);
  }

  /**
   * Forget the chosen route, so the next request probes again. Called when the
   * network changes, and when the app returns to the foreground on the
   * fallback, so arriving home switches back to the primary.
   */
  invalidateRoute(): void {
    this.generation += 1;
    this.resolving = null;
    this.setRoute(null);
  }

  /**
   * Takes the route another client for the same server has already picked,
   * so switching accounts does not cost a probe. Null means "probe".
   */
  adoptRoute(route: Route | null): void {
    this.generation += 1;
    this.resolving = null;
    this.setRoute(route === 'fallback' && !this.credentials.fallbackUrl ? null : route);
  }

  /**
   * The proxy's headers alone, for image requests that go through it. Empty
   * for a server with nothing in front that wants any.
   */
  get proxyHeaders(): Record<string, string> {
    return proxyHeaders(this.credentials.proxy);
  }

  /** A request that needs no PokeCollector login, only the proxy's. */
  async requestAnonymous<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    return this.onRoute(options, (base) => this.send(base, path, options, null));
  }

  async request<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    return this.onRoute(options, (base) => this.authenticated(base, path, options));
  }

  /**
   * Runs `attempt` against the current route. If the server stops answering
   * mid-session (the phone left the home network, say), the route is dropped
   * and re-probed, and a GET is retried once on whatever the probe picks.
   * Anything else is not retried: the request may have arrived before the
   * connection failed, and adding a card twice is worse than an error.
   */
  private async onRoute<T>(
    options: RequestOptions<T>,
    attempt: (base: string) => Promise<T>,
  ): Promise<T> {
    const route = await this.resolveRoute();
    try {
      return await attempt(this.urlFor(route));
    } catch (error) {
      if (!(error instanceof NetworkError) || !this.credentials.fallbackUrl) throw error;
      this.invalidateRoute();
      if ((options.method ?? 'GET') !== 'GET') throw error;
      const next = await this.resolveRoute();
      if (next === route) throw error;
      return attempt(this.urlFor(next));
    }
  }

  private async resolveRoute(): Promise<Route> {
    if (this.route) return this.route;
    if (!this.credentials.fallbackUrl) {
      this.setRoute('primary');
      return 'primary';
    }
    const generation = this.generation;
    if (!this.resolving) {
      const probe: Promise<Route> = this.probe().finally(() => {
        if (this.resolving === probe) this.resolving = null;
      });
      this.resolving = probe;
    }
    let route: Route;
    try {
      route = await this.resolving;
    } catch (error) {
      if (generation !== this.generation) return this.resolveRoute();
      throw error;
    }
    // The network changed while this probe ran, so its answer (or failure)
    // may already be wrong. Follow the probe the invalidation asked for.
    if (generation !== this.generation) return this.resolveRoute();
    this.setRoute(route);
    return route;
  }

  /**
   * Picks a route with the one request that needs neither a login nor any
   * particular state, GET /api/auth/mode. In order of preference: the primary
   * if it works, the fallback if it works, then whichever answered at all, so
   * a real error (a rejected service token, say) reaches the user rather than
   * being reported as "unreachable".
   */
  private async probe(): Promise<Route> {
    const primary = await this.probeOne('primary', PRIMARY_PROBE_TIMEOUT_MS);
    if (primary === 'ok') return 'primary';
    const fallback = await this.probeOne('fallback', DEFAULT_TIMEOUT_MS);
    if (fallback === 'ok') return 'fallback';
    if (primary === 'answered') return 'primary';
    if (fallback === 'answered') return 'fallback';
    throw new NetworkError('Neither the primary nor the fallback server answered.');
  }

  private async probeOne(
    route: Route,
    timeoutMs: number,
  ): Promise<'ok' | 'answered' | 'unreachable'> {
    try {
      await this.send(
        this.urlFor(route),
        '/api/auth/mode',
        { schema: AuthModeSchema, timeoutMs },
        null,
      );
      return 'ok';
    } catch (error) {
      return error instanceof NetworkError ? 'unreachable' : 'answered';
    }
  }

  private setRoute(route: Route | null): void {
    if (route === this.route) return;
    this.route = route;
    for (const listener of this.routeListeners) listener();
  }

  private urlFor(route: Route): string {
    return route === 'fallback' && this.credentials.fallbackUrl
      ? this.credentials.fallbackUrl
      : this.credentials.primaryUrl;
  }

  private async authenticated<T>(
    base: string,
    path: string,
    options: RequestOptions<T>,
  ): Promise<T> {
    let token = this.token ?? (await this.authenticate(base, null));
    try {
      return await this.send(base, path, options, token);
    } catch (error) {
      // A 401 on an authenticated call means the JWT is stale: expired, or the
      // backend's signing key changed. Log in once more and retry once.
      if (!(error instanceof AuthError) || error.status !== 401) throw error;
      token = await this.authenticate(base, token);
      try {
        return await this.send(base, path, options, token);
      } catch (retryError) {
        if (retryError instanceof AuthError && retryError.status === 401) {
          throw new AuthError(
            `PokeCollector still rejected the session after signing in again. ` +
              `The account ${this.credentials.username} may have been deactivated.`,
            401,
          );
        }
        throw retryError;
      }
    }
  }

  /**
   * A token, replacing `stale` if it is still the current one. Concurrent
   * callers share one in-flight login.
   */
  private async authenticate(base: string, stale: string | null): Promise<string> {
    if (this.authFailure) throw this.authFailure;
    if (this.token !== null && this.token !== stale) return this.token;
    // Never hand the rejected token out again, even if the login below fails.
    if (this.token === stale) this.token = null;
    if (!this.login) {
      this.login = this.performLogin(base).finally(() => {
        this.login = null;
      });
    }
    return this.login;
  }

  private async performLogin(base: string): Promise<string> {
    const form = new URLSearchParams({
      username: this.credentials.username,
      password: this.credentials.password,
    }).toString();
    let body: z.infer<typeof TokenResponseSchema>;
    try {
      body = await this.send(
        base,
        '/api/auth/login',
        { method: 'POST', schema: TokenResponseSchema },
        null,
        { body: form, contentType: 'application/x-www-form-urlencoded' },
      );
    } catch (error) {
      if (error instanceof AuthError) {
        this.authFailure = new AuthError(
          'PokeCollector rejected the username or password.',
          error.status,
        );
        throw this.authFailure;
      }
      throw error;
    }
    this.token = body.access_token;
    return body.access_token;
  }

  private async send<T>(
    base: string,
    path: string,
    options: RequestOptions<T>,
    token: string | null,
    raw?: { body: string; contentType: string },
  ): Promise<T> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = {
      // Sent to both routes; a proxy that does not want them ignores them.
      ...this.proxyHeaders,
      Accept: 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    let body: string | FormData | undefined;
    if (raw) {
      body = raw.body;
      headers['Content-Type'] = raw.contentType;
    } else if (options.form) {
      body = options.form;
    } else if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let response: ResponseLike;
    let text: string;
    try {
      response = await this.fetchImpl(buildUrl(base, path, options.query), {
        method,
        headers,
        body,
        // A proxy refusing a request (Access with a bad service token, say)
        // tends to redirect to its own login page.
        // Followed, that is a 200 of HTML; not followed, it is unmistakable.
        redirect: 'manual',
        // No cookies. Access sets CF_Authorization after a service-token
        // request, and a stored cookie would keep the app in after the token
        // is revoked, and outlive sign-out. The headers go on every request.
        credentials: 'omit',
        signal: controller.signal,
      });
      text = await response.text();
    } catch (error) {
      const reason = controller.signal.aborted
        ? 'The server did not answer in time.'
        : `Could not reach the server: ${error instanceof Error ? error.message : String(error)}`;
      throw new NetworkError(reason);
    } finally {
      clearTimeout(timeout);
    }

    return interpret(
      response,
      text,
      options.schema,
      `${method} ${path}`,
      proxyRejection(this.credentials.proxy),
    );
  }
}

function interpret<T>(
  response: ResponseLike,
  text: string,
  schema: z.ZodType<T> | undefined,
  what: string,
  /** What to say when the proxy, not PokeCollector, answered. */
  rejection: string,
): T {
  const { status } = response;
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  // These mean the same thing whoever sent them, so they come before the
  // question of whether the proxy or PokeCollector answered.
  if (status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new RateLimitError(
      (isJson ? describeDetail(safeParse(text)) : undefined) ??
        'PokeCollector is rate limiting requests. Wait a moment and try again.',
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  if (status >= 500 && !isJson) {
    // A proxy's own pages, such as Cloudflare's 502/504/524 for a slow or
    // failing origin and 530 when the tunnel is down.
    throw new ServerError(
      `${what} failed with HTTP ${status} before reaching PokeCollector. ` +
        'The server or its tunnel may be down.',
      status,
    );
  }

  // Anything else that is not JSON came from the proxy: a redirect to its
  // login, or an HTML block page. Upstream answers every /api route, errors
  // included, with JSON.
  if (response.redirected || (status >= 300 && status < 400) || (!isJson && status !== 204)) {
    throw new ProxyError(rejection, status);
  }

  const body: unknown = text ? safeParse(text) : undefined;
  const detail = describeDetail(body);

  if (status === 401 || status === 403) {
    throw new AuthError(detail ?? 'Not signed in to PokeCollector.', status);
  }
  if (status === 404) throw new NotFoundError(detail ?? `${what}: not found.`, status);
  if (status === 409) throw new ConflictError(detail ?? `${what}: conflict.`, status);
  if (status === 422) throw new ValidationError(detail ?? `${what}: invalid request.`, status);
  if (status >= 500) throw new ServerError(detail ?? `${what} failed with HTTP ${status}.`, status);
  if (status >= 400) throw new ApiError(detail ?? `${what} failed with HTTP ${status}.`, status);

  if (!schema) return body as T;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ResponseShapeError(
      `${what} returned an unexpected shape: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      status,
    );
  }
  return parsed.data;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** FastAPI's `{ "detail": ... }`, where detail is a string or a list of 422 issues. */
function describeDetail(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('detail' in body)) return undefined;
  const { detail } = body as { detail: unknown };
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown } | undefined;
    if (first && typeof first.msg === 'string') return first.msg;
  }
  return undefined;
}

export function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions<unknown>['query'],
): string {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}
