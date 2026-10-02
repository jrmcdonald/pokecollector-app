#!/usr/bin/env bash
# Runs the walkthrough once, at one text size, on a freshly erased simulator.
#
#   e2e/walkthrough.sh <name> <content size>
#   e2e/walkthrough.sh default large
#   e2e/walkthrough.sh largest accessibility-extra-extra-extra-large
#
# Expects what the workflow sets up: SIM_UDID, APP_PATH, APP_BUNDLE_ID,
# CA_CERT, SERVER_URL and OUT, the fake server running, and the walkthrough
# built for testing into build/walkthrough. It runs from the .xctestrun file
# that build-for-testing wrote there, so it needs no Xcode project: the
# workflow builds on one runner and walks on others.
set -euo pipefail

name=$1
size=$2

# Erased every time: the Keychain holds the sign-in, and each run should start
# at onboarding with nothing cached. A function, so a retry starts fresh too.
prepare() {
  # Let the workflow's first boot finish before shutting it down mid-way.
  xcrun simctl bootstatus "$SIM_UDID" -b > /dev/null
  xcrun simctl shutdown "$SIM_UDID" 2>/dev/null || true
  xcrun simctl erase "$SIM_UDID"
  xcrun simctl boot "$SIM_UDID"
  xcrun simctl bootstatus "$SIM_UDID" -b > /dev/null

  # 9:41 and full bars, so the status bar is the same in every screenshot.
  xcrun simctl status_bar "$SIM_UDID" override \
    --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
  # The fake server's certificate authority, so the app trusts https://localhost.
  xcrun simctl keychain "$SIM_UDID" add-root-cert "$CA_CERT"
  xcrun simctl ui "$SIM_UDID" content_size "$size"
  # Reduce Motion, which the app respects: images appear without fading in,
  # so a screenshot or an audit cannot catch one half drawn.
  xcrun simctl spawn "$SIM_UDID" defaults write com.apple.Accessibility ReduceMotionEnabled -bool true
  xcrun simctl install "$SIM_UDID" "$APP_PATH"
  # The first launch after an erase is slow while iOS prepares the app, and once
  # outlasted XCUITest's launch timeout. Launch it once here, where there is no
  # timeout; nothing is signed in, so the walkthrough still starts at onboarding.
  xcrun simctl launch "$SIM_UDID" "$APP_BUNDLE_ID" > /dev/null
  sleep 5
  xcrun simctl terminate "$SIM_UDID" "$APP_BUNDLE_ID" || true
  # A freshly erased simulator goes on with its own work for a while, and
  # XCUITest's launch has timed out in it, on the first attempt and not on a
  # retry that waited. So every attempt waits; it also gives the app a moment
  # before it is let out to the network.
  sleep 15
}
prepare

xctestrun=$(ls build/walkthrough/Build/Products/*.xctestrun | head -n 1)

server_lines_before=$(wc -l < "$OUT/server.log")
walk() {
  rm -rf "${OUT:?}/$name" "$OUT/$name.xcresult"
  mkdir -p "$OUT/$name"
  # A time limit, so a hang fails here, with the diagnostics below, rather
  # than when the job runs out of time. A walk takes up to about 12 minutes.
  TEST_RUNNER_APP_BUNDLE_ID="$APP_BUNDLE_ID" \
  TEST_RUNNER_OUTPUT_DIR="$OUT/$name" \
  TEST_RUNNER_SERVER_URL="$SERVER_URL" \
    xcodebuild test-without-building \
      -xctestrun "$xctestrun" \
      -destination "id=$SIM_UDID" \
      -resultBundlePath "$OUT/$name.xcresult" \
      -test-timeouts-enabled YES \
      -default-test-execution-time-allowance 900 \
      -maximum-test-execution-time-allowance 900 \
      > "$OUT/$name.log" 2>&1
}
set +e
walk
status=$?
set -e
# XCUITest giving up on the simulator, not the app failing a check: it could
# not launch the app, or could not get a screenshot from it. On a slow runner
# either happens now and then. Once, from a freshly erased simulator; a
# second failure is real. A failed check is never retried: only the first
# error counts, since the diagnostics after a failed check take a screenshot
# that can time out too.
if [ "$status" -ne 0 ] &&
  { grep -m 1 'error:' "$OUT/$name.log" || true; } |
  grep -qE 'Timed out (attempting to launch app|while requesting screenshot)'; then
  echo "::warning::The simulator timed out; the walkthrough runs once more"
  grep -E 'error:|Test Case .* failed' "$OUT/$name.log" || true
  # The first attempt's results stay, beside the second's.
  mv "$OUT/$name.log" "$OUT/$name-attempt1.log"
  rm -rf "$OUT/$name-attempt1" "$OUT/$name-attempt1.xcresult"
  mv "$OUT/$name" "$OUT/$name-attempt1"
  if [ -e "$OUT/$name.xcresult" ]; then mv "$OUT/$name.xcresult" "$OUT/$name-attempt1.xcresult"; fi
  # A retry is only worth it against a server that still answers. One that
  # does not is the failure to report, not the simulator.
  if ! curl -fsS --max-time 10 --cacert "$CA_CERT" "$SERVER_URL/api/auth/mode" > /dev/null; then
    echo "::error::The fake server no longer answers; not retrying"
    tail -n 40 "$OUT/server.log"
    exit 1
  fi
  # Under set -e, so a step that fails here stops the run with its own error
  # instead of leaving the walkthrough a broken simulator.
  prepare
  server_lines_before=$(wc -l < "$OUT/server.log")
  set +e
  walk
  status=$?
  set -e
fi

grep -E '^AUDIT|error:|Test Case .* failed|\*\* TEST' "$OUT/$name.log" || true

if [ "$status" -ne 0 ]; then
  # What the walkthrough saw when it stopped, and what the app asked the
  # server for, so a failure can be read from the job log alone.
  echo "::group::What was on screen"
  sed -n '/^DIAGNOSE-BEGIN/,/^DIAGNOSE-END/p' "$OUT/$name.log" | head -n 600
  echo "::endgroup::"
  echo "::group::Requests to the fake server in this run"
  tail -n "+$((server_lines_before + 1))" "$OUT/server.log" | tail -n 80
  echo "::endgroup::"
  echo "::group::Is the fake server still answering?"
  curl -sS --max-time 10 --cacert "$CA_CERT" "$SERVER_URL/api/auth/mode" || true
  echo
  echo "::endgroup::"
fi
exit $status
