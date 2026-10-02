# Simulator tests

Screenshot tests and Apple's accessibility audit, run by the `Simulator`
workflow on macOS runners. Nothing here ships in the app.

- `server/` is a fake PokeCollector: made-up data (`fixtures.ts`) served over
  HTTPS by `fake-server.ts`. `npm test` checks every answer against the app's
  own schemas.
- `ios/` is the walkthrough, an XCUITest generated into an Xcode project with
  XcodeGen. It signs in through onboarding, then visits each main screen,
  saving a screenshot and running `performAccessibilityAudit` on it.
- `walkthrough.sh` runs it once, at one text size, on a freshly erased
  simulator, from the `.xctestrun` file the build wrote. The workflow runs it
  at the default size and at the largest accessibility size, on two runners
  at the same time.
- `report.ts` compares the default-size screenshots with the approved ones in
  `screenshots/` and writes both audits into the job summary.

## How the workflow runs

1. **build** (macOS) builds the app, Release for the simulator, and the
   walkthrough, and passes both on as an artifact. ccache keeps compiled
   native code between runs, so an unchanged file is not compiled again.
2. **simulator (default)** and **simulator (largest)** (macOS, side by side)
   each boot a simulator, start the fake server and walk the app at one text
   size.
3. **walkthrough** (Linux) gathers both, compares the screenshots, writes the
   summary, approves when asked, and fails if anything before it did. It is
   the check to read.

## When the workflow fails

- **Audit issues** are listed in the job summary, per text size, with the
  screen and the element. Fix them in the app. The screenshots in the run's
  `simulator-screenshots` artifact show the screen as the audit saw it.
- **A walkthrough step failed**: that size's `simulator (…)` job log shows
  what was on screen and what the app asked the fake server for, and its
  `simulator-results-…` artifact has the `.xcresult`.
- **Screenshots differ**: the artifact has this run's screenshots and, under
  `diff/`, where they changed. If the change is intended, approve it.

## Approving screenshots

Add the `approve-screenshots` label to the pull request. The workflow runs
again, commits that run's default-size screenshots to `screenshots/` on the
branch, and removes the label. On a branch without a pull request, run the
workflow by hand with **approve** ticked.

Only a run where both walkthroughs passed approves. If one fails, nothing is
committed and the label stays on, so re-running the run approves once it
passes.

A push made by the workflow does not start other workflows, so the approving
commit has no checks of its own. The next push to the branch runs them, and
its Simulator run is the first to compare against the new screenshots. Push
before merging, but not while the approving run is still going: a push cancels
the branch's run in progress, and with it the approval. Re-running an earlier run does not help: it runs again on the
commit it ran on before.

The approved screenshots belong to one simulator model and iOS version,
recorded in `screenshots/device.txt`. The workflow pins them, with the runner
image and Xcode (`SIM_DEVICE`, `SIM_OS` and `XCODE_VERSION` in
`simulator.yml`). When the runner image stops offering them, the workflow
fails and says so: move the pins on, and approve the screenshots again.

## Flakes

Before each attempt, a throwaway XCUITest session (`testLaunch`) launches
the app and quits, and its result is ignored. The runner's first XCUITest
session does slow one-off work on the Mac that has timed out launching the
app; this way the walkthrough never is that session. Its log is
`<size>-warm-up.log`.

The walkthrough runs once more, from a freshly erased simulator, only when
its first error is XCUITest timing out launching the app or taking a
screenshot. The first attempt's log, screenshots and `.xcresult` stay beside
the second's, as `<size>-attempt1`. A failed check is never retried.

The simulator runs with Reduce Motion on, so images appear without a fade,
and the app with `TZ=UTC`.

## Pods

`ios/` is generated, so the pods' lock lives in `native/Podfile.lock` and is
copied in after `expo prebuild` (`scripts/ci/pod-install.sh`). When it no
longer matches, after an Expo SDK upgrade say, the build job warns and prints
the new one in its log: commit that as `native/Podfile.lock`.

## Running the fake server locally

```bash
node e2e/server/fake-server.ts --port 8443 --cert server.pem --key server-key.pem
```

Node 22.18 or later runs the TypeScript directly. The workflow's "Start the
fake server" step shows how to make the certificates.
