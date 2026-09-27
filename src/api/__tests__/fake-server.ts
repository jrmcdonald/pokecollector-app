import type { FetchLike, ResponseLike, ServerCredentials } from '../client';

export const CREDENTIALS: ServerCredentials = {
  primaryUrl: 'https://pc.example.com',
  fallbackUrl: null,
  accessClientId: 'id.access',
  accessClientSecret: 'secret',
  username: 'ash',
  password: 'pikachu',
};

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | FormData;
  credentials: string;
}

type Reply = {
  status: number;
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string>;
  redirected?: boolean;
};

/** A fetch that answers from a route table and records every call. */
export function fakeFetch(route: (call: Call) => Reply | Promise<Reply>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
      credentials: init.credentials,
    };
    calls.push(call);
    const reply = await route(call);
    const contentType = reply.contentType ?? (reply.body === undefined ? '' : 'application/json');
    const headers: Record<string, string> = {
      ...(contentType ? { 'content-type': contentType } : {}),
      ...reply.headers,
    };
    const response: ResponseLike = {
      status: reply.status,
      redirected: reply.redirected ?? false,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      text: async () =>
        reply.body === undefined
          ? ''
          : typeof reply.body === 'string'
            ? reply.body
            : JSON.stringify(reply.body),
    };
    return response;
  };
  return { fetch, calls };
}

export const loginOk = (token: string): Reply => ({
  status: 200,
  body: {
    access_token: token,
    token_type: 'bearer',
    user: { id: 1, username: 'ash', role: 'user' },
  },
});
