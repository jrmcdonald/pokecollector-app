# pokecollector-app

A personal iOS app for a self-hosted [PokeCollector](https://github.com/Git-Romer/pokecollector),
built with Expo, compiled in GitHub Actions, and sideloaded with AltStore.

> [!WARNING]
> **This code is unapologetically vibe coded.** It was written largely by an AI
> coding assistant, for one person's own collection, and reviewed about as
> carefully as that suggests. It is provided **as is, with no warranties or
> guarantees of any kind**: not that it works, not that it is secure, not that
> it will not eat your collection. No support is offered and none should be
> expected. If you point it at your own server, you do so entirely at your own
> risk.

It is not affiliated with PokeCollector, The Pokémon Company, Nintendo, Game
Freak or Creatures.

## What it needs

- A PokeCollector server you run yourself, reachable over **https**.
- Optionally, [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
  in front of it with a service token for the app. The app sends the token's
  headers on every request; a server without Access ignores them.
- An iPhone, AltStore (or similar) and a free Apple ID.

Nothing about your server is built into the app or committed here. On first
launch it asks for:

| Field                              | Example                              | Notes                                                                                         |
| ---------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Primary address                    | `https://pokecollector.home.example` | Tried first. Typically a LAN-only name, used at home                                          |
| Fallback address                   | `https://pokecollector.example.com`  | Optional. Used whenever the primary does not answer, e.g. a public hostname behind Cloudflare |
| Service token client ID and secret |                                      | From Cloudflare Zero Trust → Access → Service credentials                                     |
| Username and password              |                                      | Your PokeCollector account                                                                    |

All of it stays in the phone's Keychain. With two addresses, the app checks
which one answers (the primary gets three seconds) and re-checks when the
network changes, so it uses the home address on home Wi-Fi and the public one
everywhere else. Both must reach the same PokeCollector server.

## Getting a build onto the phone

1. Run the **iOS build** workflow (Actions → iOS build → Run workflow) with
   `development`. To use your own bundle ID prefix, set an Actions variable
   `BUNDLE_ID_PREFIX` (e.g. `com.example`) first.
2. Download the `PokeCollector-development` artifact and unzip it to get the
   `.ipa`.
3. Install it with AltStore (AltServer running on the PC, phone on the same
   network).
4. On the PC: `npm ci`, then `npm start`. Open PokeCollector Dev on the phone
   and connect to the PC's Metro server.

Only rebuild when native code changes; everything else hot-reloads.

## Docs

- [`docs/PLAN.md`](docs/PLAN.md) — the build plan and where it has got to
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — why things are the way they are
- [`docs/API.md`](docs/API.md) — how the app uses PokeCollector's API
- [`CLAUDE.md`](CLAUDE.md) — commands and conventions

## License

Released into the public domain under [The Unlicense](LICENSE). Do what you
like with it; see the warning above for what that is worth.

One exception: `openapi/` and `src/api/generated.ts` are generated from
PokeCollector's own source, which is licensed under the
[AGPL-3.0](https://github.com/Git-Romer/pokecollector/blob/main/LICENSE). They
describe its API rather than implement it, but they are derived from that
source and are not the author's to dedicate to the public domain.
