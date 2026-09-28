# Simulator tests

Screenshot tests and Apple's accessibility audit, run by the `Simulator`
workflow on a macOS runner. Nothing here ships in the app.

- `server/` is a fake PokeCollector: made-up data (`fixtures.ts`) served over
  HTTPS by `fake-server.ts`. `npm test` checks every answer against the app's
  own schemas.
- `ios/` is the walkthrough, an XCUITest generated into an Xcode project with
  XcodeGen. It signs in through onboarding, then visits each main screen,
  saving a screenshot and running `performAccessibilityAudit` on it.
- `walkthrough.sh` runs it once, at one text size, on a freshly erased
  simulator. The workflow runs it at the default size and at the largest
  accessibility size.
- `report.ts` compares the default-size screenshots with the approved ones in
  `screenshots/` and writes both audits into the job summary.

## When the workflow fails

- **Audit issues** are listed in the job summary, per text size, with the
  screen and the element. Fix them in the app. The screenshots in the run's
  `simulator-screenshots` artifact show the screen as the audit saw it.
- **Screenshots differ**: the artifact has this run's screenshots and, under
  `diff/`, where they changed. If the change is intended, approve it.

## Approving screenshots

Add the `approve-screenshots` label to the pull request. The workflow runs
again, commits that run's default-size screenshots to `screenshots/` on the
branch, and removes the label. On a branch without a pull request, run the
workflow by hand with **approve** ticked.

A push made by the workflow does not start other workflows, so push again (or
re-run CI) before merging.

The approved screenshots belong to one simulator model and iOS version,
recorded in `screenshots/device.txt`. When the runner's newest model changes,
every screenshot differs, and they need approving again.

## Running the fake server locally

```bash
node e2e/server/fake-server.ts --port 8443 --cert server.pem --key server-key.pem
```

Node 22.18 or later runs the TypeScript directly. The workflow's "Start the
fake server" step shows how to make the certificates.
