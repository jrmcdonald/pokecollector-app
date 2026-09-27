# pokecollector-app

A personal iOS app for a self-hosted [PokeCollector](https://github.com/Git-Romer/pokecollector),
built with Expo, compiled in GitHub Actions, and sideloaded with AltStore.

- [`docs/PLAN.md`](docs/PLAN.md) — the build plan and where it has got to
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — why things are the way they are
- [`docs/API.md`](docs/API.md) — how the app uses PokeCollector's API
- [`CLAUDE.md`](CLAUDE.md) — commands and conventions

## Getting a build onto the phone

1. Run the **iOS build** workflow (Actions → iOS build → Run workflow) with
   `development`.
2. Download the `PokeCollector-development` artifact and unzip it to get the
   `.ipa`.
3. Install it with AltStore (AltServer running on the PC, phone on the same
   network).
4. On the PC: `npm ci`, then `npm start`. Open PokeCollector Dev on the phone
   and connect to the PC's Metro server.

Only rebuild when native code changes; everything else hot-reloads.
