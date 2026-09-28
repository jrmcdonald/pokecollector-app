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

Requests are sent with `redirect: 'manual'` and `credentials: 'omit'` via `expo/fetch`. No cookies: Access sets `CF_Authorization` after a service-token request, and a stored cookie would keep the app in after the token is revoked. Both Access headers are omitted when no service token is configured. Access rejects a
bad service token with a redirect or an HTML page, never JSON; the client
treats any non-JSON response other than a 5xx or 429 as an `AccessError`.

## Which address

Every request goes to the active address: the primary, or the fallback when
the primary does not answer. `GET /api/auth/mode` doubles as the probe that
decides, because it needs no login. See `PLAN.md` §2.0.

## Endpoints in use

| Endpoint                                                                | Auth               | Used for                             | Notes                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/auth/mode`                                                    | none               | Connection test, step 1              | `{ multi_user, locked }`. Untyped in the spec. `multi_user: false` means the login screen is off; the app refuses to connect                                                                                                                                                           |
| `POST /api/auth/login`                                                  | none               | Getting a JWT                        | Form-encoded `username`, `password` → `{ access_token, token_type, user }`. 7-day token. 5 attempts/minute per IP                                                                                                                                                                      |
| `GET /api/auth/me`                                                      | JWT                | Connection test, step 2; Home        | `{ id, username, role, avatar_id, must_change_password }`. Untyped in the spec                                                                                                                                                                                                         |
| `POST /api/cards/recognize/jobs`                                        | JWT                | Scan: upload                         | Multipart, one `files` part: the cropped JPEG. Returns the job at once (`{ id, status, total, … }`); recognition runs in the background. 400 when no scanner provider or key is configured for the account. Up to 15 MB a photo; the app sends a few hundred KB                        |
| `GET /api/cards/recognize/jobs/{id}`                                    | JWT                | Scan: polling                        | The job with `items`, each `{ id, status, resolved, error, recognized, matches, next_attempt_at }`. `status` is `pending`, `processing`, `retrying`, `done` or `failed`. Polled at 1, 2, 4 then 8 s, or at `next_attempt_at` (naive UTC) while retrying; two minutes at most           |
| `POST /api/cards/recognize/jobs/{id}/items/{item}/resolve-and-add`      | JWT                | Scan: confirm                        | `{ card_id, quantity, variant, condition, lang, confirmed_card_id }`. `confirmed_card_id` must be one of the item's `matches[].tcg_card_id`, and `card_id` (the match's `id`, with its language) must be the same card. Atomic, and a repeat is refused (409) rather than adding twice |
| `POST /api/cards/recognize/jobs/{id}/items/{item}/retry`                | JWT                | Scan: try again                      | For a failed item                                                                                                                                                                                                                                                                      |
| `DELETE /api/cards/recognize/jobs/{id}`                                 | JWT                | Scan: cancel, retake, search instead | Drops the job and its photo, so abandoned scans do not pile up in the web UI's scan inbox                                                                                                                                                                                              |
| `GET /api/collection/{id}/photo`                                        | JWT                | Card images                          | The owner's own photo of an entry, used only when the card has no other image and the entry has `has_scan_photo`                                                                                                                                                                       |
| `GET /api/collection/printing-detail-tags`                              | JWT                | Printing details picker              | The account's tags, `{ id, name, usage_count }`. Collection writes take `printing_details` as a list of names; an unknown name creates the tag                                                                                                                                         |
| `GET /api/pokedex/images/artwork/{id}.png`                              | none (Access only) | Account avatars                      | The Pokémon from `avatar_id` in `/api/auth/me`, served from the server's cache; not in the spec                                                                                                                                                                                        |
| `GET /api/dashboard/`                                                   | JWT                | Home                                 | Totals, `owned_sets`/`total_sets`, `recent_additions` and `top_cards` (each already priced per variant as `price_market`). Also carries a `value_history` the app ignores for now                                                                                                      |
| `GET /api/collection/`                                                  | JWT                | Collection, card detail              | The whole collection, unpaginated; each entry embeds its `card` with `set_ref`. Filtered and sorted on the phone                                                                                                                                                                       |
| `GET /api/cards/{id}`                                                   | JWT                | Card detail                          | Catalogue card and prices. No `set_ref` and no ownership: the app takes both from the collection or an earlier search                                                                                                                                                                  |
| `GET /api/cards/search?q=&page=&page_size=`                             | JWT                | Search                               | `{ data, total_count, page, page_size }`. Each result carries `owned`, `owned_quantity` and `wishlisted`, so the owned badge costs no extra requests                                                                                                                                   |
| `POST /api/collection/`                                                 | JWT                | Add copies                           | `{ card_id, quantity, variant, condition }`. Merges into an existing entry with the same card, variant, condition and language                                                                                                                                                         |
| `PUT /api/collection/{id}`                                              | JWT                | Quantity stepper                     | Quantity must be 1–999                                                                                                                                                                                                                                                                 |
| `DELETE /api/collection/{id}`                                           | JWT                | Quantity to 0                        | Confirmed first                                                                                                                                                                                                                                                                        |
| `POST /api/wishlist/`                                                   | JWT                | Add to wishlist                      | Adds to the quantity if already wishlisted                                                                                                                                                                                                                                             |
| `GET /api/wishlist/`                                                    | JWT                | Wishlist                             | Each entry embeds its `card` with `set_ref`                                                                                                                                                                                                                                            |
| `DELETE /api/wishlist/{id}`                                             | JWT                | Wishlist, swipe to remove            | Optimistic                                                                                                                                                                                                                                                                             |
| `GET /api/sets/`                                                        | JWT                | Sets                                 | Every set in the account's catalogue language, newest first, each with `owned_count` (distinct cards owned). Cached for an hour and refreshed when the collection changes                                                                                                              |
| `GET /api/sets/{id}/checklist`                                          | JWT                | Set checklist                        | `{ set, cards, owned_count, total_count, progress }`, cards in number order with `owned`, `owned_quantity` and `wishlisted`. Untyped in the spec. The first call for a set may fetch it from TCGdex, so the app allows it a minute                                                     |
| `GET /api/binders/`                                                     | JWT                | Binders                              | Binders and decks together, with `card_count`. The app leaves out `deck` and `physical_deck`                                                                                                                                                                                           |
| `GET /api/binders/{id}/cards`                                           | JWT                | Binder detail                        | `{ binder, cards, owned_count, total_count, missing_count, current_value, cost_to_complete, … }`. Untyped in the spec. Each card carries `binder_card_id`, the entry to remove                                                                                                         |
| `POST /api/binders/{id}/collection-items?collection_item_id=&quantity=` | JWT                | Add to a collection binder           | Query parameters, no body. Takes one exact owned copy; 409 when every copy is already in binders                                                                                                                                                                                       |
| `POST /api/binders/{id}/cards?card_id=&required_quantity=`              | JWT                | Add to a planned binder              | Query parameters, no body. Rejected (400) for a collection binder                                                                                                                                                                                                                      |
| `DELETE /api/binders/{id}/entries/{binder_card_id}`                     | JWT                | Binder detail, hold to remove        | Removes that entry only; the copy stays in the collection                                                                                                                                                                                                                              |

## Behaviour the spec does not describe

- **Variants and conditions.** Variants are `Normal`, `Holo`, `Reverse Holo`,
  `First Edition`; conditions `Mint`, `NM`, `LP`, `MP`, `HP`. The app parses
  both as plain strings so a new value from upstream cannot hide an entry.
- **Prices** are Cardmarket's, in euros. A card's value for a variant is the
  trend price, then market; a Reverse Holo tries the `*_holo` (reverse
  listing) prices first. Zero means no price. Mirrors upstream's
  `services/card_values.py`, so totals agree with the web UI.

- **Scan candidates** (`matches`) carry `id` (`sv1-025_en`), `tcg_card_id`
  (`sv1-025`), `name`, `number`, `rarity`, `set_abbreviation`, `lang`, and
  TCGdex `image`/`image_hd` URLs, so their pictures cost no requests.
  `recognized` is what the model read: `name`, `name_en`, `number_local`,
  `set_code`, `language` and more. The app checks each candidate on its own
  and drops malformed ones rather than failing the scan.

- **Binder types.** `collection` binders hold exact collection entries, so
  only owned cards appear in them; `wishlist` binders (called planned here)
  list cards to collect, owned or not, with a required quantity. `deck` and
  `physical_deck` share the endpoints and are left to the web UI.

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
