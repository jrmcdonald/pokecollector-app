/**
 * Whatever sits in front of PokeCollector and wants credentials of its own,
 * separate from the PokeCollector login.
 *
 * - `none`: the server is reached directly, on the LAN or over a VPN such as
 *   Tailscale, or through a proxy that asks for nothing.
 * - `cloudflare`: Cloudflare Access with a service token, sent as the two
 *   `CF-Access-Client-*` headers.
 * - `headers`: any other reverse proxy that wants headers of its own, such as
 *   an API key.
 *
 * Whichever it is, the headers go on every request to both addresses, and
 * the app can tell the proxy refusing a request apart from PokeCollector
 * refusing the login: the proxy answers with a redirect or HTML, upstream
 * always with JSON.
 */

export interface ProxyHeader {
  name: string;
  value: string;
}

export type ProxyAuth =
  | { kind: 'none' }
  | { kind: 'cloudflare'; clientId: string; clientSecret: string }
  | { kind: 'headers'; headers: ProxyHeader[] };

export const NO_PROXY: ProxyAuth = { kind: 'none' };

/** Custom headers allowed on one server; more is surely a mistake. */
export const MAX_PROXY_HEADERS = 5;

/** The headers to send on every request. */
export function proxyHeaders(proxy: ProxyAuth): Record<string, string> {
  switch (proxy.kind) {
    case 'none':
      return {};
    case 'cloudflare':
      return {
        'CF-Access-Client-Id': proxy.clientId,
        'CF-Access-Client-Secret': proxy.clientSecret,
      };
    case 'headers':
      return Object.fromEntries(proxy.headers.map((h) => [h.name, h.value]));
  }
}

/** What to say when something in front of PokeCollector turned a request away. */
export function proxyRejection(proxy: ProxyAuth): string {
  switch (proxy.kind) {
    case 'cloudflare':
      return 'Cloudflare Access turned the request away. The service token is wrong, revoked or expired.';
    case 'headers':
      return 'The proxy in front of PokeCollector turned the request away. Check its headers in Settings.';
    case 'none':
      return (
        'Something in front of PokeCollector answered instead of it, such as a login page. ' +
        'If that proxy needs credentials, add them in Settings.'
      );
  }
}

/** A short name for the proxy, for headings: "Could not get through …". */
export function proxyName(proxy: ProxyAuth): string {
  return proxy.kind === 'cloudflare' ? 'Cloudflare Access' : 'the proxy';
}

// An HTTP field name (RFC 9110 token).
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Headers the app sets itself, or that fetch will not let it set. Sending
 * one of these as a proxy header would break requests, not authenticate them.
 */
const RESERVED = new Set([
  'accept',
  'authorization',
  'connection',
  'content-length',
  'content-type',
  'cookie',
  'host',
  'transfer-encoding',
]);

/** Why a custom header cannot be used, or null if it can. */
export function headerProblem(header: ProxyHeader): string | null {
  const name = header.name.trim();
  if (!HEADER_NAME.test(name)) {
    return `“${name}” is not a valid header name: letters, digits and dashes only.`;
  }
  if (RESERVED.has(name.toLowerCase())) {
    return `The app sets ${name} itself, so it cannot be a proxy header.`;
  }
  if (/[\r\n]/.test(header.value) || !header.value.trim()) {
    return `${name} needs a value on one line.`;
  }
  return null;
}

/** Reads a stored proxy, or null if it is not one. */
export function parseProxy(value: unknown): ProxyAuth | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (p.kind === 'none') return NO_PROXY;
  if (
    p.kind === 'cloudflare' &&
    typeof p.clientId === 'string' &&
    typeof p.clientSecret === 'string'
  ) {
    return { kind: 'cloudflare', clientId: p.clientId, clientSecret: p.clientSecret };
  }
  if (p.kind === 'headers' && Array.isArray(p.headers)) {
    const headers = p.headers.filter(
      (h): h is ProxyHeader =>
        !!h &&
        typeof h === 'object' &&
        typeof (h as ProxyHeader).name === 'string' &&
        typeof (h as ProxyHeader).value === 'string',
    );
    if (headers.length === p.headers.length) return { kind: 'headers', headers };
  }
  return null;
}

/** The v3 and v4 formats kept a service token as two strings, both blank for none. */
export function proxyFromToken(clientId: string, clientSecret: string): ProxyAuth {
  return clientId || clientSecret ? { kind: 'cloudflare', clientId, clientSecret } : NO_PROXY;
}
