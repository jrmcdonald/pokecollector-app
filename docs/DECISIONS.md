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

Each native change is a CI build (macOS minutes at 10× on a private repo) and
an AltStore reinstall. The first dev client therefore carries the camera,
secure store, image manipulator, haptics, NetInfo and `react-native-svg` for
the later charts, so everything after it is JavaScript and hot-reloads.

## 2026-09-27 — Bundle IDs under `io.github.jrmcdonald`

`io.github.jrmcdonald.pokecollector` and `io.github.jrmcdonald.pokecollector.dev`, from the domain
the rest of this setup already uses. With AltStore, the ID Apple registers has
the team ID appended, so the prefix only has to be stable, not owned. Changing
it later costs App IDs (10 a week), so it is fixed now.

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
