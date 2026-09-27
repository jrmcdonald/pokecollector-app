# PokeCollector iOS App — Build Plan

A personal iOS client for the PokeCollector Home Assistant addon. Built with
**Expo (React Native)** on Windows, compiled on a **GitHub Actions macOS
runner**, and installed with **AltStore/AltServer** using a free Apple ID.

This is the second revision. The first assumed the addon had its own API and
MCP code to refactor. It does not, and most of its Phase 0 has gone as a result.
[`DECISIONS.md`](DECISIONS.md) records what changed and why.

> **For Claude Code:** Read this whole file before starting. Work phase by phase
> and tick checkboxes as you go. Where this plan conflicts with the upstream
> code or the OpenAPI spec in `openapi/`, the code wins; note the difference in
> `docs/DECISIONS.md`. Ask before changing the addon, the MCP addon, or the
> Cloudflare configuration.

---

## 1. Goals and non-goals

**Goal:** a clean, fast, easy-to-use app for the core PokeCollector features:

- View and edit the collection (add/remove cards, quantity, variant, condition)
- Browse and search the card catalogue, and view card details and prices
- Set checklists (owned/missing)
- Binders and wishlist (view, basic edits)
- Scan a card with the camera, confirm the match, and add it to the collection
- Switch between several PokeCollector accounts on the same server, such as a
  household's collections (§7.4)

**Non-goals (for now):** push notifications, widgets, Siri/App Intents, App
Store release, account administration, Android. Decks, trades and sealed
products can come later.

**Constraints:**

- No Mac. Development happens on a Windows PC, and iOS builds happen in CI.
- No paid Apple Developer account. A free Apple ID means apps expire after 7
  days (AltServer refreshes them), at most 3 sideloaded apps including AltStore
  itself, at most 10 App IDs registered per 7 days, and no push notifications.
- **No changes to upstream PokeCollector.** The addon runs
  [Git-Romer/pokecollector](https://github.com/Git-Romer/pokecollector)
  unmodified and Renovate keeps it current. Anything the app needs that the API
  lacks is an upstream PR, never a patch in the addon.
- Personal use only.

---

## 2. Architecture

```
iPhone app (Expo / React Native)
   │  HTTPS
   │    CF-Access-Client-Id / CF-Access-Client-Secret   ← Cloudflare service token
   │    Authorization: Bearer <PokeCollector JWT>       ← from POST /api/auth/login
   ▼
Cloudflare Access — the existing `pokecollector` application
   │  policy 1: Known Emails (browsers, via Auth0)
   │  policy 2: Service Auth, this app's service token only   ← NEW
   ▼
cloudflared tunnel → <hash>-pokecollector:80 (nginx in the addon)
   ▼
PokeCollector backend, upstream, unmodified: /api/*
   (the MCP addon is a separate client of the same API; untouched)

Card images: TCGdex CDN directly (the URLs the API returns); /api/images/* only
for custom cards that have no TCGdex image.
```

### 2.0 Two addresses: primary and fallback

The same server is usually reachable two ways: a LAN-only name at home
(through a reverse proxy such as Nginx Proxy Manager, no Access in front) and
the public hostname behind Cloudflare. The app takes a **primary** address,
tried first, and an optional **fallback**, both entered on the phone. Nothing
about either is in the code or config; the repository is public.

- The first request probes `GET /api/auth/mode` on the primary, allowing it
  3 s (a LAN name away from home often resolves to a private address that
  hangs rather than refusing). If it answers correctly the primary is used;
  otherwise the fallback is probed. If neither works, the error from whichever
  address actually answered is shown, so a rejected service token is not
  misreported as "unreachable".
- The choice is remembered until the network changes (NetInfo: connection
  type or IP address), or the app returns to the foreground while on the
  fallback, which is when arriving home should switch back. Re-probing is lazy:
  the next request does it.
- If the current address stops answering mid-session, the route is dropped and
  re-probed, and a GET is retried once on the new route. Writes are not
  retried: the request may have landed before the connection failed.
- The Access headers go to both addresses; a proxy without Access ignores them.
  One JWT serves both, since it is the same backend. Each path has its own
  rate-limit budget, which is a small bonus at home.
- The connection test checks each address separately. One that does not answer
  from the current network is accepted, with a note, as long as the other
  passes; one that answers wrongly is an error.

### 2.1 What the upstream API gives us, and what it does not

The spec for the pinned version is in `openapi/pokecollector-<version>.json`,
exported from the backend's FastAPI app (see `scripts/export-openapi.sh`).
Types are generated from it; see §8.

| Need                   | Upstream endpoint                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in                | `POST /api/auth/login` (form: `username`, `password`) → `{ access_token, user }`, a 7-day JWT                                                            |
| Who am I               | `GET /api/auth/me`                                                                                                                                       |
| Server check, no login | `GET /api/auth/mode` → `{ multi_user, locked }`                                                                                                          |
| Summary                | `GET /api/dashboard/`, `GET /api/collection/stats/summary`                                                                                               |
| Catalogue              | `GET /api/cards/search?q=&set_id=&number=&rarity=&page=&page_size=`, `GET /api/cards/{id}`, `GET /api/cards/{id}/price-history`                          |
| Sets                   | `GET /api/sets/`, `GET /api/sets/{set_id}/checklist`                                                                                                     |
| Collection             | `GET /api/collection/` (the whole collection, unpaginated), `POST /api/collection/`, `PUT /api/collection/{item_id}`, `DELETE /api/collection/{item_id}` |
| Binders                | `GET /api/binders/`, `GET /api/binders/{id}/cards`, `POST /api/binders/{id}/cards`, `DELETE /api/binders/{id}/entries/{entry_id}`                        |
| Wishlist               | `GET /api/wishlist/`, `POST /api/wishlist/`, `PUT /api/wishlist/{item_id}`, `DELETE /api/wishlist/{item_id}`                                             |
| Scan                   | `POST /api/cards/recognize/jobs` (multipart `files`) → poll `GET /api/cards/recognize/jobs/{job_id}` → `POST .../items/{item_id}/resolve-and-add`        |

Differences from the first plan, all forced by the API:

- **No device tokens.** Login is username and password only. The app keeps
  both in the Keychain and logs in again when the JWT is rejected, exactly as
  `pokecollector-mcp`'s client does.
- **No cursor pagination.** Search is `page`/`page_size`. The collection
  arrives in one response, which suits a persisted cache and client-side
  filtering and sorting.
- **Binders have no slots or pages.** A binder is a list of cards (with
  `required_quantity` and optionally a linked collection item). The binder
  screen is a card grid with owned/missing state, not a physical page layout.
- **Recognition is an LLM vision call** (Gemini or an OpenAI-compatible model,
  configured in PokeCollector's scanner settings), not a perceptual hash. It is
  already built and logs ground truth when a scan is confirmed.

### 2.2 Limits the app must live within

| Limit                            | Where                | Consequence for the app                                                                                                                                                                                                                                                   |
| -------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 60 requests/minute per client IP | backend (slowapi)    | Everything through the tunnel shares **one** IP, and so one budget, with any browser using the external name. Keep requests few: long `staleTime`, persisted cache, no speculative prefetch, images from TCGdex. On 429, back off with `Retry-After` and say so in the UI |
| 5 login attempts/minute per IP   | backend              | Same sharing. Only one re-login may be in flight at a time; never retry a 401 from the login itself                                                                                                                                                                       |
| ~100 s response timeout          | Cloudflare           | Synchronous `/api/cards/recognize` can run far longer (upstream allows 1000 s). Use the job endpoints and poll                                                                                                                                                            |
| 100 MB request body              | Cloudflare free plan | Irrelevant for single photos; a reason not to build batch upload                                                                                                                                                                                                          |
| 7-day JWT                        | backend              | Re-login on 401, transparently                                                                                                                                                                                                                                            |

### 2.3 How failures look on the wire

Upstream errors are FastAPI's `{ "detail": ... }` with a status code.
Cloudflare Access errors are **not**: a missing, wrong or expired service token
gets a `302` to `<team>.cloudflareaccess.com` or an HTML `403`. `fetch`
follows redirects by default, so without care an expired token looks like a
`200` HTML login page. The client sends `redirect: 'manual'`, requires
`application/json` on every response, and maps anything else to an
`AccessError` with "the Cloudflare service token was rejected or has expired".

---

## 3. Tech stack

| Concern          | Choice                                                                | Notes                                                                                           |
| ---------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Framework        | Expo SDK 57, TypeScript strict                                        | `expo-dev-client` for the custom dev build                                                      |
| Navigation       | `expo-router`                                                         | Tab layout                                                                                      |
| Server state     | TanStack Query v5                                                     | Cache persisted with `@tanstack/query-async-storage-persister`, so last-seen data works offline |
| API types        | `openapi-typescript` over the committed spec                          | Generated, never hand-written                                                                   |
| Validation       | `zod` at the boundary                                                 | For the fields the app relies on; the spec is the fuller description                            |
| Lists            | `@shopify/flash-list`                                                 | Big card grids                                                                                  |
| Images           | `expo-image`                                                          | Disk cache; `low.webp` in grids and `high.webp` in detail                                       |
| Camera           | `expo-camera`                                                         | Shutter capture; version-matched to the SDK. See DECISIONS.md for why not vision-camera         |
| Image processing | `expo-image-manipulator`                                              | Crop and resize before upload                                                                   |
| Secrets          | `expo-secure-store`                                                   | iOS Keychain                                                                                    |
| Haptics          | `expo-haptics`                                                        |                                                                                                 |
| Connectivity     | `@react-native-community/netinfo`                                     | Drives TanStack Query's `onlineManager`                                                         |
| Charts (later)   | `react-native-gifted-charts` + `react-native-svg`                     | Chosen now so its native dependency ships in the first dev build                                |
| Styling          | `StyleSheet` + a small theme (colors, spacing, type scale), dark only | No UI kit                                                                                       |
| Lint/format      | ESLint (`eslint-config-expo`) + Prettier                              |                                                                                                 |
| Tests            | Jest (`jest-expo`) + React Native Testing Library                     | API client and logic first                                                                      |

**Every native module goes into the first dev-client build**, including the
ones for later phases (camera, svg). Each native change means a CI rebuild and
an AltStore reinstall, so front-loading them keeps JS-only changes hot-reloadable
for the rest of the project.

---

## 4. Repository layout

```
pokecollector-app/
├── src/
│   ├── app/                  # expo-router routes (SDK 57's template puts them here)
│   │   ├── _layout.tsx
│   │   ├── onboarding.tsx
│   │   ├── settings.tsx
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx     # Home / collection overview
│   │   │   ├── search.tsx
│   │   │   ├── scan.tsx
│   │   │   ├── binders.tsx
│   │   │   └── more.tsx      # wishlist, sets, settings
│   │   ├── card/[id].tsx
│   │   ├── binder/[id].tsx
│   │   └── set/[id].tsx
│   ├── api/                  # client.ts, errors.ts, endpoints, schemas, generated types
│   ├── auth/                 # Keychain storage for the server and credentials
│   ├── session/              # signed-in session, TanStack Query setup
│   ├── hooks/                # useMe, useCollection, useCard, useScan...
│   ├── components/           # CardTile, CardGrid, QuantityStepper, EmptyState...
│   ├── scan/                 # camera pieces, crop/upload logic
│   ├── theme/
│   └── utils/                # image source choice, formatting
├── openapi/                  # the upstream spec, one file per pinned version
├── scripts/                  # export-openapi.sh
├── .github/workflows/
│   ├── ci.yml                # lint, typecheck, tests, spec drift
│   └── ios-build.yml         # manual: unsigned IPA
├── app.config.ts             # dev vs production variants
├── CLAUDE.md
└── docs/
    ├── PLAN.md
    ├── API.md                # how the app uses the upstream API
    └── DECISIONS.md
```

---

## 5. Phase 0 — Prove the risky parts first

The two things most likely to sink this are the build-and-sideload pipeline and
getting through Access from a native app. Both are cheap to prove with a nearly
empty app, and neither depends on the screens.

### 0.1 Cloudflare (Terraform in `jrmcdonald/cloudflare`)

- [x] **User, in the dashboard:** create a service token
      `pokecollector-app` (Zero Trust → Access → Service credentials), duration one
      year. Copy the client ID and secret into a password manager; the secret is
      shown once. Send its **token ID** (not the secret) to Claude.
      It stays out of Terraform for the same reason the identity providers do: a
      secret Terraform creates lives in state, and nothing outside CI can read that
      state to hand the secret to a phone.
- [x] **Terraform PR:** a `non_identity` policy `PokeCollector app` including
      only that token, attached to the existing `pokecollector` application as
      precedence 2. Known Emails stays precedence 1, so the web UI is unaffected.
      The plan must show one policy created and one in-place application update,
      nothing else.
- [x] Verify (done from an iPhone: Safari in a private tab for the first, a Shortcuts "Get Contents of URL" action with the two headers for the second):

  ```sh
  # No headers: Access login redirect, never PokeCollector
  curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://$PUBLIC_HOST/api/auth/mode"
  # Service token: through Access to the origin
  curl -sS -H "CF-Access-Client-Id: $ID" -H "CF-Access-Client-Secret: $SECRET" \
    "https://$PUBLIC_HOST/api/auth/mode"
  # {"multi_user":true,"locked":true}
  ```

### 0.2 App scaffold and CI build

- [x] Scaffold with `create-expo-app` (SDK 57, TypeScript), then add every
      dependency from §3.
- [x] `app.config.ts` with two variants driven by `APP_VARIANT`:
  - `development` → `<prefix>.pokecollector.dev`, "PokeCollector Dev", dev client
  - `production` → `<prefix>.pokecollector`, "PokeCollector"
  - `<prefix>` is `BUNDLE_ID_PREFIX`, defaulting to `io.github.jrmcdonald`
- [x] Camera usage description (through `expo-camera`'s config plugin).
- [x] `ci.yml` on every push/PR: lint, typecheck, tests.
- [x] `ios-build.yml`, manual (`workflow_dispatch`) with a `variant` input:
  1. `runs-on: macos-latest` (or the newest Xcode image Expo SDK 57 supports)
  2. `npm ci`, then `APP_VARIANT=<variant> npx expo prebuild --platform ios --clean`
  3. `pod install` (prebuild runs with `--no-install` so the pods cache can be
     restored first; keyed on `package-lock.json` and `app.config.ts`)
  4. Find the workspace and scheme with `xcodebuild -list -json` rather than
     hard-coding them; the two variants name them differently
  5. `xcodebuild archive` for `generic/platform=iOS` with
     `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""`
  6. Package `Payload/*.app` into `PokeCollector-<variant>.ipa` and upload it
     as an artifact (short retention)
- [x] **Runner minutes:** the repository is public, so standard macOS
      runners are free. Nothing secret or personal may be committed as a
      result: no server addresses, tokens or credentials, in code, config or
      docs.

### 0.3 Sideload and connect (user, on Windows)

- [ ] Install iTunes and iCloud **from Apple's website** (not the Microsoft
      Store versions), then AltServer; install AltStore on the phone.
- [ ] Download the dev IPA artifact and install it through AltStore.
- [ ] Allow Node/Metro (port 8081) through the Windows firewall on the private
      network.
- [ ] `npx expo start --dev-client` on the PC, open PokeCollector Dev, connect
      over the LAN, and use the connection screen to call `GET /api/auth/me` through
      Access.

**Done when:** the dev client is installed through AltStore, hot reload works
from the PC, and the app shows the signed-in username fetched through
Cloudflare Access.

**App slots on a free Apple ID:** AltStore + Dev + Release = 3, the limit. Keep
AltServer running and let AltStore refresh at least every 7 days. Don't churn
bundle IDs: each new one uses one of the 10 App IDs a week.

---

## 6. Phase 1 — Foundations

### 6.1 Onboarding and settings

- [x] Onboarding asks for the primary and optional fallback addresses (§2.0),
      the service token's client ID and
      secret, and a PokeCollector username and password. Manual entry; a QR code
      is not worth it for one phone.
- [x] Store all of it in `expo-secure-store`. Test in two steps so errors are
      specific: `GET /api/auth/mode` (proves Access), then login and
      `GET /api/auth/me` (proves the account). `must_change_password: true` →
      tell the user to change it in the web UI first.
- [x] Settings: view the server and user, re-test the connection, replace
      credentials, clear the cache, sign out (wipes the Keychain entries).

### 6.2 API client (`src/api/client.ts`)

- [x] `fetch` with the Access headers and bearer token injected, a timeout
      (`AbortController`), `redirect: 'manual'`, and JSON-only responses.
- [x] Typed errors: `AccessError` (redirect, non-JSON 403), `AuthError`
      (login rejected), `NotFoundError`, `ConflictError`, `ValidationError` (422),
      `RateLimitError` (429, carries `retryAfter`), `NetworkError`, `ServerError`.
      Access and auth errors route to Settings with a clear message.
- [x] Re-login on 401, once, with a single in-flight login shared by concurrent
      callers (the MCP client's `_authenticate(stale)` pattern).
- [x] 429: no automatic retry storm; TanStack Query retries honour
      `retryAfter`, and mutations surface it.
- [x] Image source helper: `card.images_small` / `images_large` when present
      (TCGdex CDN, no auth); otherwise `/api/images/card/{id}/small|large` on the
      active address with the Access headers; otherwise a placeholder.
- [x] Primary and fallback addresses, chosen by probe and re-chosen on network
      changes (§2.0). Settings shows which is in use; Home shows only an
      "Offline" marker when there is no connection.

### 6.3 Theme and shell

- [x] Theme (dark only, "Night holo"; see `DECISIONS.md`), base components,
      tab layout with placeholder
      screens.

**Done when:** a fresh install onboards, survives an app restart, recovers from
an expired JWT without the user noticing, and shows an actionable message for
a revoked service token.

---

## 7. Phase 2 — Core app (MVP)

### 7.1 Screens

- [x] **Home:** total value, card count, unique cards, recent additions and
      quick links (`/api/dashboard/`, `/api/collection/stats/summary`).
- [x] **Collection:** grid/list toggle, search, filters (set, rarity, variant)
      and sort (value, recent, name, set number), all client-side over the cached
      collection. Tapping a card opens its detail.
- [x] **Card detail:** large image, set and number, prices, owned entries with
      a quantity stepper and variant and condition pickers. Buttons for "Add to
      collection", "Add to wishlist" and "Add to binder". Price history can wait.
- [x] **Search (catalogue):** debounced (≥ 400 ms, given the rate limit),
      `page`/`page_size` infinite scroll, an owned badge computed against the
      cached collection rather than an extra request per tile.
- [x] **Sets:** list with a completion bar; the checklist shows owned vs
      missing (missing greyed out) with a "missing only" toggle.
- [x] **Binders:** list, then the binder's cards as a grid with owned/missing
      state. Add a card from its detail screen; remove from the binder view.
- [x] **Wishlist:** list with prices and swipe to remove.

### 7.2 Offline and optimistic edits

- [x] Persist the query cache so screens show last-known data offline.
- [x] Quantity, wishlist and binder edits update the UI at once and roll back
      with a toast if the request fails.
- [ ] **Offline writes are out of scope for the MVP.** Edits need a
      connection; the UI disables them offline and says why. Queued offline
      mutations need each one registered with `setMutationDefaults` to survive a
      restart, plus conflict handling, which is not worth it for one user yet.
- [x] A small "offline" indicator.

### 7.3 UX quality bar

- [ ] Skeleton loaders rather than spinners, pull-to-refresh everywhere.
- [ ] A useful empty state for every list.
- [x] Haptic feedback on quantity change and on adding a card.
- [ ] Tap targets 44 pt or larger; Dynamic Type supported sensibly.
- [ ] Smooth scrolling in 500+ card grids (FlashList, correctly sized images).

**Done when:** the collection, wishlist and binders can be browsed and edited
daily without opening the web UI, and a normal session never hits a 429.

### 7.4 Multiple accounts

PokeCollector keeps a separate collection, wishlist and binders per account,
and there is no shared or read-only view. A household with several collectors
on one server needs one login each. The app holds several accounts **on one
server** and switches between them; `pokecollector-mcp`'s `additional_accounts`
solves the same problem the same way.

- [ ] **Stored model.** One server entry (the two addresses and the service
      token) and a list of accounts (username, password, opaque cache ID, and
      a display name that defaults to the username), plus which one is active.
      All of it lives in the Keychain, as now; the stored format gets a
      version bump and the existing single account is migrated into the list.
- [ ] **One client per account.** Each account has its own client with its
      own JWT and login latch, over the shared route choice (primary or
      fallback is a property of the server, not the account). Logins stay lazy:
      an account signs in the first time it is used, not at launch, because
      five logins a minute are shared with every browser behind the tunnel.
- [ ] **Switching.** From Home (tap the account name) and from Settings. The
      switch is instant: query keys already start with the account's cache ID,
      so each account's persisted data is shown straight away and refreshed in
      the background. No cache is cleared on a switch.
- [ ] **Adding an account.** Settings → Accounts → Add: username and password
      only, tested against the server already configured. Removing one wipes
      its Keychain entry and its cached queries.
- [ ] **Always visible.** The active account's name shows on Home and in any
      edit confirmation, so a card is never added to the wrong collection by
      accident.
- [ ] **Tests.** Migration from the single-account format; per-account token
      isolation; switching keeps each account's cache; removing an account
      clears only its data.

Out of scope: several **servers** (the addresses and service token stay
single), a combined view across accounts, and anything that needs an admin
login (creating accounts stays in the web UI).

**Done when:** two accounts can be added, switched between from Home in one
tap without a spinner for cached screens, and edits land in the active
account's collection.

---

## 8. Phase 3 — Scanning

- [ ] **Prerequisite:** a scanner provider configured in PokeCollector for the
      account the app signs in as (Settings → Scanner in the web UI, on the LAN
      name because the configuration test outlasts Cloudflare's timeout).
- [ ] **Camera screen:** full-screen preview with a card-shaped guide
      (63 × 88 mm, aspect ≈ 0.716), torch toggle and shutter.
- [ ] **Capture:** crop to the guide and resize to about 1200 px on the long
      edge, JPEG quality ≈ 0.85. The model reads the collector number, set code and
      regulation mark, so smaller risks misreads. Upstream sanitises and re-encodes
      anyway.
- [ ] **Upload** with `POST /api/cards/recognize/jobs` (one file), then poll
      `GET /api/cards/recognize/jobs/{job_id}` with backoff (1 s, 2 s, 4 s … capped;
      each poll counts against the rate limit). Show the candidates as tiles, plus
      "none of these, search instead", which opens a prefilled search.
- [ ] **Confirm sheet:** variant, condition, quantity → `POST
.../items/{item_id}/resolve-and-add` (atomic and idempotent upstream).
      "Add to binder" afterwards is a second call.
- [ ] **Quick-scan mode:** after confirming, straight back to the camera, with
      a running tally.
- [ ] **Later:** auto-capture with edge detection. That needs frame
      processors, which means adding `react-native-vision-camera` and a CI
      rebuild.

**Done when:** a sleeved or unsleeved card on a table gives the right card in
the top 3 most of the time, and adding it takes 2 taps or fewer after the scan.

---

## 9. Keeping up with upstream

The addon's upstream version moves with Renovate, and the API is not
versioned. So:

- [x] `scripts/export-openapi.sh <version>` exports the spec for a given
      upstream release. It pulls the backend image and calls FastAPI's own
      `app.openapi()`, with no database needed.
- [x] `ci.yml` regenerates the TypeScript types from the committed spec and
      fails if they differ from what is committed.
- [ ] When the addon's upstream pin moves: export the new spec, commit it, and
      let the type diff show what the app has to handle. Zod at the boundary
      catches whatever the spec does not describe (several endpoints return
      untyped dicts).

---

## 10. Later ideas (only if the app gets heavy use)

- Decks, trades and sealed product screens
- Price history charts and top movers
- Auto-capture and batch "rip mode" scanning (only on the primary address when
  that is the LAN one: the batch body can exceed Cloudflare's 100 MB)
- Upstream PRs for API tokens or cursor pagination, if their absence starts to
  hurt
- Pokémon artwork for account avatars instead of initials. The sprites and
  artwork belong to Nintendo, Game Freak and The Pokémon Company, so this
  public repo must never bundle them; loading them at runtime from a source
  the user chooses keeps the repo clean, but is still their call to make
- Revisit native Swift or a paid Apple account if widgets start to matter

---

## 11. Conventions for Claude Code

- TypeScript strict and no `any`. Types come from the generated spec; zod
  validates what the app depends on.
- Components small and in `src/components`. Screens compose hooks and
  components.
- All server access goes through `src/api` and hooks, never `fetch` in screens.
- **Never commit** credentials. Nothing secret in `.env` or `app.config.ts`;
  credentials come from secure storage at runtime.
- Keep native code to a minimum and prefer maintained Expo-compatible
  libraries. Any change to native dependencies means a CI rebuild; flag it
  clearly in the commit message.
- Small, descriptive commits, one per checklist item where practical.
- Update `docs/API.md` when the app starts using a new endpoint and
  `docs/DECISIONS.md` for notable choices.
