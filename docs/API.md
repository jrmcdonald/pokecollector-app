# How the app uses the PokeCollector API

The app calls upstream PokeCollector's REST API directly; there is no
app-specific API. The authoritative description is the OpenAPI spec for the
pinned upstream version, in `openapi/`, from which `src/api/generated.ts` is
generated. This file records what the app relies on and anything the spec does
not say.

Pinned upstream version: **1.51.0** (match `ha-addons/pokecollector/Dockerfile`).

## Every request

| Header                    | Value                   | Why                                                           |
| ------------------------- | ----------------------- | ------------------------------------------------------------- |
| `CF-Access-Client-Id`     | service token client ID | Gets through Cloudflare Access                                |
| `CF-Access-Client-Secret` | service token secret    | 〃                                                            |
| `Authorization`           | `Bearer <JWT>`          | PokeCollector's session, except on login and `/api/auth/mode` |

Requests are sent with `redirect: 'manual'` via `expo/fetch`. Access rejects a
bad service token with a redirect or an HTML page, never JSON; the client
treats any non-JSON response other than a 5xx or 429 as an `AccessError`.

## Which address

Every request goes to the active address: the primary, or the fallback when
the primary does not answer. `GET /api/auth/mode` doubles as the probe that
decides, because it needs no login. See `PLAN.md` §2.0.

## Endpoints in use

| Endpoint               | Auth | Used for                      | Notes                                                                                                                        |
| ---------------------- | ---- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/auth/mode`   | none | Connection test, step 1       | `{ multi_user, locked }`. Untyped in the spec. `multi_user: false` means the login screen is off; the app refuses to connect |
| `POST /api/auth/login` | none | Getting a JWT                 | Form-encoded `username`, `password` → `{ access_token, token_type, user }`. 7-day token. 5 attempts/minute per IP            |
| `GET /api/auth/me`     | JWT  | Connection test, step 2; Home | `{ id, username, role, avatar_id, must_change_password }`. Untyped in the spec                                               |

## Behaviour the spec does not describe

- **Rate limits.** 60 requests a minute per client IP on everything (slowapi),
  answered with 429 and `{ "error": "Rate limit exceeded: ..." }`. Login has
  its own 5-a-minute limit, answered with 429 and `{ "detail": "Too many login
attempts. Try again in 1 minute." }`. Behind the tunnel all external clients
  share one IP.
- **Errors** are FastAPI's `{ "detail": string }`, or for 422
  `{ "detail": [{ loc, msg, type }] }`.
- **401** on any authenticated route means the JWT is missing, expired or
  signed with a key the backend no longer has. The client logs in again once.
- **Card images.** `images_small` and `images_large` on a card are full
  TCGdex CDN URLs (`https://assets.tcgdex.net/.../low.webp` and `high.webp`).
  `GET /api/images/card/{id}/{small|large}` proxies and caches them, needs no
  JWT, but is behind Access and counts against the rate limit, so the app uses
  it only for custom cards.
