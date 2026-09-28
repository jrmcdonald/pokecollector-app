# Decisions

Notable choices, newest last. Each one says what was decided and why, so a
later change can tell whether the reason still holds.

## 2026-09-27 — Use upstream's API as it is; no `/api/v1`

The first plan had the app talk to a new `/api/v1` router in the addon, with
MCP tools and REST sharing a refactored service layer. That assumed the addon
had code of its own. It does not: `ha-addons/pokecollector` runs
Git-Romer/pokecollector's published images unmodified under s6, and
`pokecollector-mcp` is a separate addon that already calls upstream's REST API
as an ordinary client. Upstream already has everything the MVP needs (see
`PLAN.md` §2.1), including a scanner.

Adding endpoints would mean forking upstream inside an addon whose whole
design is that it doesn't, and re-merging on every Renovate bump. Gaps become
upstream PRs.

## 2026-09-27 — Username and password in the Keychain, not device tokens

Upstream's only credential is `POST /api/auth/login`, which returns a 7-day
JWT. There are no API tokens to mint, list or revoke, so the planned device-
token and QR onboarding can't exist without a fork. The app stores the
PokeCollector username and password in the Keychain and logs in again on a
401, the same approach as `pokecollector-mcp/src/pokecollector_mcp/client.py`,
including its single-flight re-login (upstream allows five logins a minute per
IP, and behind the tunnel every external client shares one IP).

Revocation is changing the account's password, or revoking the Cloudflare
service token, which cuts the app off at the edge without touching the
browser's access.

## 2026-09-27 — A Service Auth policy on the existing Access application

The first plan put a separate Service-Auth-only Access application on
`/api/v1/*`. On the real paths that would be `/api/*`, which the web UI's own
JavaScript calls, so browsers would start getting 403s. Instead the existing
`pokecollector` application gets a second policy: `non_identity`, including
only this app's service token. Known Emails stays first, so nothing changes
for browsers.

The token is created in the dashboard, and Terraform references it by ID. A
token Terraform creates has its secret in state, and nothing outside CI can
read that state to hand the secret to a phone. That is the same reason the
identity providers are dashboard-managed in `jrmcdonald/cloudflare`.

## 2026-09-27 — Scanning uses upstream's scan jobs, not a new recognizer

Upstream recognises cards with a vision model (Gemini or OpenAI-compatible),
and records ground truth when a scan is confirmed. The planned pHash matcher
would be a weaker duplicate. The app uses the asynchronous job endpoints
(enqueue, poll, `resolve-and-add`) rather than synchronous
`/api/cards/recognize`, because Cloudflare gives up after about 100 seconds
and upstream allows a single recognition up to 1000.

Captures are resized to about 1200 px on the long edge rather than 600 × 825:
the model has to read the collector number and set code.

## 2026-09-27 — Binders are card lists

Upstream binders have no slots or pages (`BinderCard` has no position). The
binder screen is a grid of the binder's cards with owned/missing state, not a
physical page layout.

## 2026-09-27 — Images straight from TCGdex

The API's `images_small`/`images_large` are already full
`assets.tcgdex.net/.../low.webp` and `high.webp` URLs. Loading them directly
keeps image traffic off upstream's 60 requests/minute budget and needs no
Access headers. Custom cards with no TCGdex image fall back to
`/api/images/card/{id}/{small|large}` with the Access headers.

## 2026-09-27 — No offline writes in the MVP

Queued offline mutations only survive an app restart if each is registered
with `setMutationDefaults`, and replaying them needs conflict handling. For
one user that is not worth it yet. Reads work offline from the persisted
cache; edits need a connection.

## 2026-09-27 — Every native module in the first dev build

Each native change is a CI build (fifteen minutes or more on a macOS runner)
and an AltStore reinstall. The first dev client therefore carries the camera,
secure store, image manipulator, haptics, NetInfo and `react-native-svg` for
the later charts, so everything after it is JavaScript and hot-reloads.

## 2026-09-27 — Bundle IDs under `io.github.jrmcdonald`, overridable

`io.github.jrmcdonald.pokecollector` and `…pokecollector.dev`, the repository's
own GitHub namespace, rather than a domain of the owner's: the repository is
public, and a personal domain in the app config says more about where the
server lives than it needs to. `BUNDLE_ID_PREFIX` overrides it for forks. With
AltStore, the ID Apple registers has the team ID appended, so the prefix only
has to be stable, not owned. Changing it later costs App IDs (10 a week).

## 2026-09-27 — `expo-camera` for capture, not vision-camera

The first plan chose `react-native-vision-camera`. Its current major (v5) is
built on Nitro modules, needs two extra native peers
(`react-native-nitro-modules`, `react-native-nitro-image`) and ships no Expo
config plugin. The MVP scan flow is a shutter button and a crop, which
`expo-camera` does, at a version matched to the SDK and with its own config
plugin for the permission string. vision-camera earns its place only with
frame processors, for auto-capture; that is a later phase, and the rebuild it
costs then is accepted.

## 2026-09-27 — Routes in `src/app/`

The SDK 57 template puts Expo Router's routes in `src/app/` rather than
`app/`, keeping all source under `src/`. The plan's layout follows the
template.

## 2026-09-27 — The repository is public; nothing about the server is in it

Public, for free standard macOS runners. So no server address, hostname,
token or credential appears in code, config or docs; everything that
identifies a server is entered on the phone and kept in the Keychain. Docs use
`example.com` names and placeholders such as `$PUBLIC_HOST`.

## 2026-09-27 — A primary and an optional fallback address

At home the server is best reached on a LAN name (no tunnel, its own
rate-limit budget, and no Cloudflare body or timeout limits); everywhere else,
only the public hostname works. Rather than a toggle the user has to remember,
the app takes both and picks by probing `GET /api/auth/mode`, primary first
with a 3 s allowance, and re-picks when the network changes or when it
returns to the foreground on the fallback. `PLAN.md` §2.0 has the rules.

Considered and rejected: trying the primary on every request and falling back
per request (every request away from home would pay the timeout), and
switching on the Wi-Fi network name (reading the SSID on iOS needs location
permission, and a name does not prove the server is reachable).

## 2026-09-27 — The Unlicense

The code is dedicated to the public domain under the Unlicense, with no
warranty, and the README says plainly that it is vibe coded and unsupported.
The exception is the OpenAPI spec and the types generated from it, which are
derived from PokeCollector's AGPL-3.0 source; the README says so.

## 2026-09-27 — No cookies, opaque cache keys, one login per connection test

From the review of the first PR:

- Requests go out with `credentials: 'omit'`. Access answers a service-token
  request with a `CF_Authorization` cookie, and `expo/fetch` would keep it in
  the shared cookie store: across launches, past sign-out, and past a revoked
  token. The headers are sent on every request anyway.
- Query keys start with an opaque id stored alongside the credentials in the
  Keychain, never the address or username, because the query cache is
  persisted to AsyncStorage. The id survives a password or token change and
  is replaced when the server or account changes.
- A rejected password latches: the client fails every later request at once
  rather than trying to log in again, because the five-a-minute login budget
  is shared with every browser behind the tunnel. Saving new credentials
  builds a new client.
- The connection test's JWT is handed to the session, so saving does not log
  in a second time.
- The Cloudflare service token is optional (both halves or neither), for a
  server with no Access in front.

## 2026-09-27 — Phase 2 screens: where things live

- **Collection is a screen off Home, not a tab.** The five tabs are Home,
  Search, Scan, Binders and More, as planned; Home carries the totals and a
  "Browse your collection" button.
- **Owned badges in search come from the search response.** Upstream's search
  results already carry `owned_quantity`, so there is no need to match them
  against the cached collection.
- **Card detail reads ownership from the cached collection**, because the
  card endpoint returns neither ownership nor the set's name. The set name
  comes from the collection or an earlier search when either has it.
- **Filters and sort are action sheets** (`ActionSheetIOS`), which need no
  dependency and suit an iOS-only app.
- **Quantity changes are optimistic** and roll back with an alert on failure;
  taking an entry to zero asks first. Adding copies is not optimistic, since
  upstream decides whether it merges into an existing entry.

## 2026-09-27 — Multiple accounts: several logins, one server

Planned in `PLAN.md` §7.4. Upstream collections are per account, with no
shared view, so a household needs a login each. The app will hold several
accounts against one configured server rather than several servers: that is
the case that exists, and it keeps the addresses, service token and route
choice single. Each account gets its own client and token, logging in lazily,
and switching relies on the per-account cache IDs already in place, so it
costs no requests for cached screens.

## 2026-09-27 — The "Night holo" look, dark only

Chosen from three directions mocked up in Claude Design (clean native,
collector's binder, night holo).

- **Dark only.** `Appearance.setColorScheme('dark')` at launch makes the native
  headers, tab bar, alerts and keyboards dark whatever the phone is set to. It
  is a JavaScript call, so the change needs no native build; the splash
  screen's colors, which are native, stay as they are until the next build
  touches `app.config.ts`.
- **Colors:** near-black background, two raised surfaces, a yellow accent with
  dark text on it, and a teal "holo" edge on card art.
- **Fonts:** Space Grotesk for text and JetBrains Mono for prices, counts and
  collector numbers, both under the SIL Open Font License, from the
  `@expo-google-fonts` packages. They load at runtime from the bundle with
  `useFonts`, one file per weight, and each weight is its own family name, so
  styles set `fontFamily` and never `fontWeight`. A failed load falls back to
  the system font rather than holding the splash screen.
- **Avatars are initials** by default: the first letter of the account's
  name on the accent color.
- **The address in use moved to Settings.** Home shows only an "Offline"
  marker; which address answered is a detail for Settings.

## 2026-09-27 — Sets, binders and wishlist

- **Sets and Wishlist live under More**, with Settings; Binders keeps its tab.
  The Sets list defaults to the sets with a card owned, since the catalogue
  has hundreds.
- **Only binders, not decks.** Upstream serves decks from the binder
  endpoints; they have their own rules (real decks allocate copies) and stay
  in the web UI.
- **Adding to a binder follows upstream's two kinds.** A collection binder
  takes one exact owned copy, so the app asks which copy when there are
  several and refuses when there is none; a planned binder takes the card
  whether owned or not.
- **Removing is a gesture with a confirmation or an undo.** Binder cards are
  removed with a long press and a confirmation; wishlist rows with a swipe,
  optimistically, restored if the server refuses. VoiceOver gets a "Remove"
  action on the row.
- **Every collection change marks sets, checklists and binders stale.** Only
  the screen on show refetches straight away, so a change costs one or two
  requests rather than one per cached list.

## 2026-09-27 — Multiple accounts, as built

Follows the plan in `PLAN.md` §7.4, with these details:

- **Keychain format v4:** `{ server, accounts, activeId }` in one item. The
  v3 single-account item is migrated on first launch, keeping its cache id as
  the account's id, so nothing cached is lost; the new item is written before
  the old one is deleted.
- **The rules live in `src/auth/accounts.ts` as pure functions** and the
  per-account clients in `src/session/client-pool.ts`, both unit-tested; the
  React provider only wires them up.
- **The connection form still edits the current account's login.** A new
  primary address replaces every account (they belonged to the old server); a
  username that is already saved switches to it; a new one replaces the
  current account. A change to the addresses or service token retires every
  account's client, since each carries them.
- **Switching adopts the route** the previous account's client had picked,
  so it costs no probe, and reuses that account's client (and token) if it
  has one, so it costs no login either.
- **Removing an account removes only its queries** (`removeQueries` on its
  id); signing out still clears everything.
- **Edits name the account** ("To ash's collection") only when more than one
  is saved.

## 2026-09-28 — Avatars are the Pokémon chosen in PokeCollector

Each PokeCollector account can pick a Pokémon (1–151) as its avatar in the
web UI; `/api/auth/me` returns it as `avatar_id`. The app shows that Pokémon's
official artwork, from the server's own image cache
(`/api/pokedex/images/artwork/{id}.png`), which needs Access but no login.
Nothing is bundled: the artwork belongs to Nintendo, Game Freak and The
Pokémon Company, and this repository is public. The disk cache key leaves out
the address, so it downloads once per Pokémon. No avatar, or an image that
fails, falls back to the initial. (The web UI itself uses animated sprites
from PokeAPI's GitHub; the server's copy keeps the app to one origin.)

## 2026-09-28 — Scanning

- **Background jobs, not the synchronous endpoint.** `POST
/api/cards/recognize` waits for the model inside the request, which can
  outlast Cloudflare's 100-second timeout; the jobs API returns at once and is
  polled. Polls back off (1, 2, 4, then 8 s, or upstream's own retry time) and
  stop after two minutes, so one scan costs about half a dozen requests.
- **The phone crops and shrinks the photo** to the card guide plus a small
  margin, about 1200 px on the long edge, JPEG 0.85. The crop maths assumes the
  preview fills its view, and lives in `src/utils/crop.ts` with tests.
- **Uploads use an expo-file-system `File`.** `expo/fetch` encodes a
  FormData part from anything with `bytes()`, but not React Native's
  `{ uri, type, name }` objects. expo-file-system is already in the native
  build through `expo`; listing it in `package.json` changes nothing native.
- **Abandoned scans are deleted upstream** (cancel, retake, search instead),
  so they do not collect in the web UI's scan inbox. Confirmed scans are
  resolved by `resolve-and-add`, which also deletes the photo.
- **Two taps after the shutter:** a candidate, then Add. Variant, condition
  and quantity default to Normal, NM and 1, and the camera comes straight back
  with a running tally. Binders stay on the card's page.

## 2026-09-28 — After the first phone test

- **Notices are in-app banners** (`src/utils/toast.ts`, `ToastHost`), themed
  and dismissed with a tap, instead of system alerts. Questions before
  something destructive (remove a copy, an account, a binder card) stay
  native alerts.
- **Pull-to-refresh shows only for the person's own pull.** Binding the
  spinner to `isRefetching` showed it for background refreshes too, and iOS
  could leave it stuck on a screen left mid-refresh.
- **The owner's photo stands in for a missing card image**, as in the web UI:
  when a card has no TCGdex or custom image and the entry has a photo
  (`has_scan_photo`), `GET /api/collection/{id}/photo`, with the login, cached
  per account and entry.
- **Card art fills its frame** (`cover`): scans are slightly taller than
  63 × 88, and `contain` left a sliver at the top and bottom.
- **Every variant can be chosen**, the catalogue's first: its flags are
  often incomplete. An owned copy's variant, condition and printing details
  can be changed in place, and printing details can be set when adding (a new
  name creates the tag upstream).
- **The saved service token secret is not shown in a field**; it is a
  masked summary with Replace, which sidesteps the field that kept wrapping.
- **Scan screen sits above the tab bar** (bottom safe area), the shade's
  cut-out has the guide's rounded corners, results can always be closed, and
  upstream's missing-key error (German for Gemini) gets the app's own words.
