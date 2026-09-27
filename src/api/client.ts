/**
 * The one place the app talks to PokeCollector.
 *
 * Two credentials ride on every request. The Cloudflare service token gets it
 * through Access; the PokeCollector JWT says whose collection it is. Upstream
 * has no API tokens, so the JWT comes from POST /api/auth/login with the
 * username and password kept in the Keychain, and lasts seven days.
 *
 * Re-authentication follows pokecollector-mcp's client: upstream allows five
 * logins a minute per IP, and behind the tunnel every external client is one
 * IP. Several queries seeing a 401 at once must converge on one login, so each
 * hands back the token it used and only the first to arrive replaces it.
 */
import type { z } from 'zod';

import {
  AccessError,
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
import { TokenResponseSchema } from './schemas';

export interface ServerCredentials {
  /** Origin only, e.g. https://pokecollector.example.com — no trailing path. */
  baseUrl: string;
  accessClientId: string;
  accessClientSecret: string;
  username: string;
  password: string;
}

/** The subset of fetch the client uses, so tests can supply their own. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string | FormData;
    redirect: 'manual';
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

export class PokeCollectorClient {
  private token: string | null = null;
  private login: Promise<string> | null = null;

  constructor(
    private readonly credentials: ServerCredentials,
    private readonly fetchImpl: FetchLike,
  ) {}

  get baseUrl(): string {
    return this.credentials.baseUrl;
  }

  /** The Access headers alone, for image requests that go through the proxy. */
  get accessHeaders(): Record<string, string> {
    return {
      'CF-Access-Client-Id': this.credentials.accessClientId,
      'CF-Access-Client-Secret': this.credentials.accessClientSecret,
    };
  }

  /** A request that needs no PokeCollector login, only Access. */
  async requestAnonymous<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    return this.send(path, options, null);
  }

  async request<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    let token = this.token ?? (await this.authenticate(null));
    try {
      return await this.send(path, options, token);
    } catch (error) {
      // A 401 on an authenticated call means the JWT is stale: expired, or the
      // backend's signing key changed. Log in once more and retry once.
      if (!(error instanceof AuthError) || error.status !== 401) throw error;
      token = await this.authenticate(token);
      try {
        return await this.send(path, options, token);
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
  private async authenticate(stale: string | null): Promise<string> {
    if (this.token !== null && this.token !== stale) return this.token;
    if (!this.login) {
      this.login = this.performLogin().finally(() => {
        this.login = null;
      });
    }
    return this.login;
  }

  private async performLogin(): Promise<string> {
    const form = new URLSearchParams({
      username: this.credentials.username,
      password: this.credentials.password,
    }).toString();
    let body: z.infer<typeof TokenResponseSchema>;
    try {
      body = await this.send(
        '/api/auth/login',
        { method: 'POST', schema: TokenResponseSchema },
        null,
        {
          body: form,
          contentType: 'application/x-www-form-urlencoded',
        },
      );
    } catch (error) {
      if (error instanceof AuthError) {
        throw new AuthError('PokeCollector rejected the username or password.', error.status);
      }
      throw error;
    }
    this.token = body.access_token;
    return body.access_token;
  }

  private async send<T>(
    path: string,
    options: RequestOptions<T>,
    token: string | null,
    raw?: { body: string; contentType: string },
  ): Promise<T> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = {
      ...this.accessHeaders,
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
      response = await this.fetchImpl(buildUrl(this.credentials.baseUrl, path, options.query), {
        method,
        headers,
        body,
        // Access answers a bad service token with a redirect to its login page.
        // Followed, that is a 200 of HTML; not followed, it is unmistakable.
        redirect: 'manual',
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

    return interpret(response, text, options.schema, `${method} ${path}`);
  }
}

function interpret<T>(
  response: ResponseLike,
  text: string,
  schema: z.ZodType<T> | undefined,
  what: string,
): T {
  const { status } = response;
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  // These mean the same thing whoever sent them, so they come before the
  // question of whether Cloudflare or PokeCollector answered.
  if (status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new RateLimitError(
      (isJson ? describeDetail(safeParse(text)) : undefined) ??
        'PokeCollector is rate limiting requests. Wait a moment and try again.',
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  if (status >= 500 && !isJson) {
    // Cloudflare's own pages: 502/504/524 for a slow or failing origin, 530
    // when the tunnel is down.
    throw new ServerError(
      `${what} failed with HTTP ${status} before reaching PokeCollector. ` +
        'The server or its tunnel may be down.',
      status,
    );
  }

  // Anything else that is not JSON came from Cloudflare Access: a redirect to
  // its login, or its HTML block page. Upstream answers every /api route,
  // errors included, with JSON.
  if (response.redirected || (status >= 300 && status < 400) || (!isJson && status !== 204)) {
    throw new AccessError(
      'Cloudflare Access turned the request away. The service token is wrong, revoked or expired.',
      status,
    );
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
