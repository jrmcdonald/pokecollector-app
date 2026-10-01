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

Superseded on 2026-09-29, when auto-capture came: see "Auto-capture and
library photos".

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
- **Every variant can be chosen**, always in the same order (Normal, Holo,
  Reverse Holo, First Edition), with the first one the catalogue lists
  preselected: its flags are often incomplete. An owned copy's variant, condition and printing details
  can be changed in place, and printing details can be set when adding (a new
  name creates the tag upstream).
- **The saved service token secret is not shown in a field**; it is a
  masked summary with Replace, which sidesteps the field that kept wrapping.
- **Scan screen sits above the tab bar** (bottom safe area), the shade's
  cut-out has the guide's rounded corners, results can always be closed, and
  upstream's missing-key error (German for Gemini) gets the app's own words.

## 2026-09-28 — Automated accessibility checks

The first step of the design and accessibility review (`PLAN.md` §8.2).

- **Theme contrast is a test.** `src/theme/__tests__/contrast.test.ts` lists
  every foreground the app puts on every background, with the WCAG 2.2 AA
  minimum it must meet: 4.5:1 for text, 3:1 for control edges and meaningful
  graphics. All text already passed (the lowest is secondary text on a
  selected control, 5.3:1). The control edges did not: `border` is 1.1–1.4:1,
  so fields, unselected chips, secondary buttons and the torch now use a new
  `outline` colour (3.1–3.9:1), and `border` is kept for decoration.
- **Accessibility lint.** `eslint-plugin-react-native-a11y` with its iOS
  rules, except the one requiring a hint on every label: Apple treats hints
  as optional, and forcing them makes VoiceOver repeat itself. The plugin
  declares ESLint 8 but works with 9; `package.json` overrides its peer
  dependency, as for openapi-typescript. It found images that Smart Invert
  would turn into negatives, and a Replace button VoiceOver could not reach.
- **Component tests find controls as VoiceOver does**, by role and accessible
  name, with React Native Testing Library. They found that a button showing
  its spinner had no name, and that views given a role or label without
  `accessible` (the progress bar, loading placeholders, the connection error)
  were never exposed to VoiceOver at all.

## 2026-09-28 — Design review fixes

The second step of `PLAN.md` §8.2: the review against Apple's Human Interface
Guidelines, WCAG 2.2 AA, Apple's Accessibility Nutrition Labels and the BBC
Mobile Accessibility Guidelines found 3 high, 8 medium and 8 low findings.
Every one was fixed except Larger Text (below).

- **Hidden gestures have visible, native alternatives.** A long press on a
  binder card, or on a wishlist row, opens an action sheet with the action
  named, and VoiceOver gets the same action from its Actions rotor. (It was
  expo-router's `Link.Menu` context menu at first, but its native preview
  wrapper hid every tile in a list from VoiceOver, which the simulator audit
  caught.) Taking a card out of
  a binder no longer asks first: it is undone by adding it back, the card
  stays in the collection, and a banner says so. Swipe to remove stays on the
  wishlist as a shortcut.
- **Icons are SF Symbols** (`Icon`, over expo-symbols' `SymbolView`), not text
  glyphs: they match iOS, follow the weight of the text beside them and are
  hidden from VoiceOver unless given a label. Tests replace `SymbolView` with
  a plain view (`jest.setup.ts`).
- **Accent means "you can press this."** Values (the collection's worth,
  trend prices) are in the text colour; progress bars are holo, and green
  when complete.
- **A card's frame says one thing each:** a hairline for normal copies, holo
  for holo and reverse holo, dashed with a "Missing" mark for cards not owned,
  so missing is never shown by fading alone. The quantity badge shows only
  from two copies up.
- **Screens reached from a tab have large titles** (each tab is its own
  stack, `TabStack`), headings are headings for the VoiceOver rotor
  (`ThemedText`'s title and heading variants), and a card's name moves into
  the navigation bar once its heading scrolls away.
- **Settings is a grouped list** (accounts, connection, data, sign out); the
  server addresses and login moved to their own screen, `/connection`.
- **Two-way choices are a segmented control** (`Segmented`); chips stay for
  the longer lists, such as variant and condition.
- **Reduce Motion** turns off the banner's slide and image fades
  (`useReduceMotion`).
- **The wishlist total says what it leaves out** ("Plus 3 cards with no price
  yet") instead of counting unpriced cards as free.
- **Scan results put a card whose number matches the photo first**, marked
  "Matches", with its rarity (`rankCandidates` in `src/api/scan.ts`).
- **Later: Larger Text.** The app has not been checked at the largest
  Dynamic Type sizes, and fixed heights (tiles, rows, the tab bar's
  neighbours) will clip. That needs screenshots at each size, so it waits for
  the simulator screenshot tests.

## 2026-09-28 — Simulator screenshot tests and the accessibility audit

The third step of `PLAN.md` §8.2, in the `Simulator` workflow (`e2e/`).

- **One XCUITest, not Maestro.** Apple's `performAccessibilityAudit` only
  runs inside an XCUITest, so the walkthrough that takes the screenshots is
  one too: one tool, no Java, and the audit sees exactly the screen that was
  photographed. The test drives the installed app by bundle ID, from a tiny
  Xcode project that XcodeGen generates in CI, so nothing is added to the
  app's native project.
- **A fake server over real HTTPS.** The app refuses plain http, and that
  rule stays. CI makes a throwaway certificate authority, adds it to the
  simulator's trust store, and serves made-up fixtures from
  `https://localhost`. The fixtures are typed against the app's schemas and
  parsed through them in `npm test`, and card images are drawn placeholders,
  so screenshots never depend on TCGdex or a real account.
- **Two text sizes.** Each run erases the simulator, signs in through
  onboarding, and walks the screens at the default size, then again at the
  largest accessibility size. The audit's Dynamic Type and clipped-text
  checks at the largest size are how Larger Text (M1 in the review) gets
  checked.
- **Only the default size is compared.** Its screenshots are approved into
  `e2e/screenshots/`, and a change fails the run until approved again, by
  label or by hand. The largest-size screenshots are for reading, in the
  run's artifact: approving both would double the images kept in git for
  little more protection.
- **An issue has to show up twice.** Element detection works from the
  screen image, and once flagged text on a screen that passed the run
  before, unchanged. A screen with issues is audited again after two
  seconds, and only issues found both times fail the run.
- **Approving commits from CI.** The `approve-screenshots` label makes a run
  commit its screenshots to the branch and remove the label, so approving
  never needs a Mac.
- **The walkthrough found real bugs on its first full runs:** Home's stat
  tiles broke words at the largest text size, binder cards inside
  `Link.Menu` were missing from the accessibility tree, and back buttons were
  named "(tabs)". All three are fixed; see the commits on PR #6.

## 2026-09-29 — Bulk scanning

`PLAN.md` §8.1, on the jobs API the single scan already uses.

- **A mode on the Scan tab, not a separate screen.** "One card" and "Batch"
  share the camera, guide and crop. In a batch the shutter puts the cropped
  photo in a tray (bottom left, where iOS's camera keeps its own), and "Scan
  N" sends them. Photos stay on the phone until then, so a batch can be
  photographed offline; only sending needs a connection.
- **One job, one poll for all of it.** The batch goes up as one multipart
  request, and `GET /api/cards/recognize/jobs/{id}` returns every item, so
  thirty photos cost the same to wait on as one. The review polls every 3 s,
  easing to 10 s, and stops when nothing is left to read (`batchPollDelay`).
  Photos that are ready can be reviewed while the rest are read.
- **The phone's own photos in the review.** Upstream serves each photo, but
  one request apiece. The app moves the cropped photos into the cache
  directory, one folder per account and job, and shows those. If iOS has
  cleared them, or the batch came from the web UI, the list shows numbered
  placeholders and only the photo opened for review is fetched. The folders
  go when a job is finished, discarded, or no longer in the inbox.
- **"Add all" is a paced queue.** `resolve-and-add` is one request per card,
  so the queue sends them one after another, a second apart, and waits out a
  429 for as long as `Retry-After` says (or 15 s) before trying the same card
  again. It stops on a lost connection or a rejected login rather than
  failing every card in turn; whatever is left stays in the job. A repeat of
  a card whose request landed is refused by upstream with 409, which the
  queue counts as handled, so running it again never adds twice. Ownership
  queries are refreshed once at the end, not once per card.
- **Search from inside the review.** "Search instead" in a single scan opens
  the Search tab, which would lose a batch's place. In a batch it is a
  search in the photo's sheet. `resolve-and-add` only takes the item's own
  candidates, so a card found this way is added with `POST /api/collection/`
  and the photo then resolved with an empty body. The queue remembers a card
  already added this way, so a retry after a dropped connection only
  resolves.
- **Skipping a photo resolves it upstream**, as the web UI's "dismiss" does,
  after asking: the photo is deleted there. Discarding the batch deletes the
  job; cards already added stay.
- **Left for later.** Unfinished jobs, from the app or the web UI, are listed
  by `GET /api/cards/recognize/jobs`. The Scan tab shows how many photos are
  waiting ("5 to review"), also on the camera-permission screen, since
  reviewing needs no camera, and opens the list. It is not a tab badge: that
  would cost a request on every launch, and the count is only useful on the
  Scan tab.
- **Photos from the library wait for a native build** (`expo-image-picker`),
  as planned.
- **The simulator walkthrough covers it:** the fake server has a batch read
  to the end, with a photo of each kind, and the walkthrough screenshots and
  audits the list, the review and one opened photo. Its first run found no
  audit issues on them at either text size.

## 2026-09-29 — Prebuilt decks

`PLAN.md` §9 (Phase 4), JavaScript only.

- **Pasted lists, not a bundled catalogue.** The export text of Pokémon TCG
  Live (`4 Pikachu ex SVI 57`), which Limitless and most deck sites also
  give, covers any deck, new or old. `PokemonTCG/pokemon-tcg-data` was the
  other candidate, and it does not hold up: it is deprecated (its API goes
  offline in March 2027), has no licence, and its theme decks stop at
  Sword & Shield's fourth set, so none of the current battle decks are in
  it. A catalogue can be added later on top of the same import.
- **Upstream finds the cards.** The deck CSV import looks a card up by set
  abbreviation and number, and upstream's abbreviations are TCGdex's, which
  are Pokémon TCG Live's set codes (SVI, PAL, MEG and so on). The parser
  maps the few that differ (promo codes such as `PR-SV` → `SVP`) and puts
  basic Energy, however it is written, in SVE by type. So resolving a
  60-card list costs one request, not a search per line.
- **The planned deck is the preview.** Looking the list up creates a planned
  deck and imports into it, then shows that deck: every card, its picture,
  and how many are already owned, with the lines upstream could not find
  listed separately to search for or leave out. Nothing touches the
  collection until "Add". Discarding deletes the deck. The review screen
  has no back button or back gesture, so the deck is never left behind by
  accident. The import is a pushed screen, not a modal: a card opened from
  the review would otherwise be presented as a sheet with no way back.
- **The import is all or nothing upstream.** One unknown card makes it
  write nothing, and report `row N`. The app then imports again without
  those rows, so a list with a typo costs one request more, not a failure.
- **Adding is two requests.** `bulk-add` with every copy, Near Mint, in each
  card's usual variant (the first the catalogue lists, as on a card's page),
  then `convert-to-real`, which reserves those copies. Upstream refuses the
  conversion when a copy is missing or reserved by another deck; the cards
  stay added and the deck stays planned, and the app says so.
- **Decks are under More.** Binders still leave them out. A deck's page
  lists its cards, copies and what is missing; a planned deck can be added
  to the collection from there too, for a deck planned first and bought
  later. Editing decks stays in the web UI.
- **The simulator walkthrough covers it:** the fake server has a planned
  deck with cards missing and a Real Deck, and the walkthrough screenshots
  the list, the planned deck and the paste screen. Looking cards up writes,
  which the fake server refuses, so the review is covered by component
  tests instead.

## 2026-09-29 — Faster Simulator runs

`PLAN.md` §8.2. A run took 35 to 50 minutes, one job doing everything in
turn: prebuild and pods (about 6), the Release app build (13 to 23), then the
walkthrough at the default text size (about 11) and at the largest (about 9).

- **The two text sizes run at the same time, on separate runners.** A
  `simulator` matrix job per size, after a `build` job that hands over the app
  and the walkthrough as one artifact. Two simulators on one runner would
  have been simpler, but a hosted macOS runner has three cores, and the
  walkthrough already has timing-sensitive steps (typing, launch); sharing
  them would make those flakier.
- **The walkthrough runs from its `.xctestrun` file**, so the walkthrough
  runners need no Xcode project, XcodeGen or npm install: the fake server is
  Node alone.
- **The builds travel as a tarball.** Artifacts drop the executable bit, and
  an app without it does not launch.
- **ccache for the native build.** React Native's pods wrap clang in ccache
  when asked (`USE_CCACHE`, and `apple.ccacheEnabled` in the generated
  `Podfile.properties.json`); the workflow sets both on the runner only, so
  the app's configuration, and the phone's build, are unchanged. The cache is
  restored before the build and saved even when a later step fails, under a
  key per run, restoring the newest. Swift is not cached by ccache, so the
  Expo modules still compile each time.
  Until 2026-09-30 it cached nothing (`--show-stats` read 0 calls), most
  likely because React Native's wrapper runs `$CCACHE_BINARY clang` and the
  pods set `CCACHE_BINARY` only as a build setting, which Xcode does not pass
  to the compiler, so the wrapper ran plain clang. The workflow now
  sets it in the environment, and the build step warns when ccache answers
  no calls.
  The workflow also runs on pushes to `main`: caches belong to the branch
  that saved them, and a pull request can restore only its own and `main`'s,
  so without a run on `main` every new pull request started cold. Measured on
  PR #10: 18.6 min to compile before the fix, 5.3 with an empty cache, 2.1
  with a warm one (645 of 645 calls hit).
- **Each walkthrough runner boots its simulator straight after checkout.** A runner's
  first boot does one-off work that once stalled the app when left to the
  walkthrough; setting up the runner now overlaps it. `walkthrough.sh` still
  launches the app once before the test, for the launch timeout.
- **The check keeps its name.** The final job, on Linux, is still called
  `walkthrough`: it compares, reports, approves, and fails if the build, either
  walkthrough or the comparison did.
- **`ci.yml` stays one job.** It takes about a minute, most of it `npm ci`,
  which each parallel job would repeat.

## 2026-09-29 — Auto-capture and library photos

`PLAN.md` §8 (auto-capture) and §8.1 (photos from the library), together so
they cost one iOS build and one AltStore reinstall.

- **vision-camera replaces `expo-camera`, rather than joining it.** Frame
  processors need `react-native-vision-camera` (v5, with
  `react-native-vision-camera-worklets`, `react-native-nitro-modules` and
  `react-native-nitro-image`); two camera libraries would ship two capture
  stacks for one screen. Versions are pinned exactly, since Expo's version map
  does not cover them. vision-camera has no config plugin, so the camera
  usage string is set in `ios.infoPlist`. Its frame worklets run on
  `react-native-worklets`, already there for Reanimated.
- **Edge detection that knows where to look.** No rectangle detector, native
  or bundled: the guide already says where the card should be. On each 640 ×
  480 luma frame the worklet makes a dozen short cuts across each side of the
  guide, finds the strongest change in brightness on each, and counts a side
  when most of them fall on one straight line. All four sides, holding within
  a fifth of the search band for five checks in a row (about half a second at
  ten checks a second), takes the photo. Pure JavaScript, so it is unit-tested
  on made-up frames (`utils/card-detect.ts`). It finds the card, not whether
  it is in focus; the half second of holding still is meant to give iOS's
  continuous autofocus time to settle. To be checked on the phone.
- **One photo per card left in the guide.** After a photo, auto-capture waits
  until the card has been gone for three checks, so a card left on the table
  is not photographed over and over. Turning Auto on takes a card already in
  the guide.
- **Off by default, a switch beside the torch.** The shutter still works with
  it on. While a card is found and held, the guide turns yellow and thicker
  and the hint says "Hold still…"; in a batch, "Got it. Next card" once it is
  taken. The frame output is attached only while Auto is on.
- **Library photos are shrunk, not cropped.** Nothing lined them up with the
  guide, so the model gets the whole photo, down to 1200 px on the long edge
  like a camera photo. iOS's picker runs outside the app and returns only
  what was chosen, so there is no photo-library permission prompt; the usage
  string is there in case iOS ever asks.
- **Only for batches.** Picking is a way to add many photos at once: a
  library button where the tray goes while it is empty, and "Add from your
  photos" in the tray. Without camera access, "Scan photos from your library"
  sends the chosen photos straight off as a batch, since there is no tray to
  collect them in. That button is on the simulator's Scan screenshot, which
  needs approving again.
