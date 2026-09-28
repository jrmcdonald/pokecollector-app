#!/usr/bin/env bash
# Runs the walkthrough once, at one text size, on a freshly erased simulator.
#
#   e2e/walkthrough.sh <name> <content size>
#   e2e/walkthrough.sh default large
#   e2e/walkthrough.sh largest accessibility-extra-extra-extra-large
#
# Expects what the workflow sets up: SIM_UDID, APP_PATH, APP_BUNDLE_ID,
# CA_CERT, SERVER_URL and OUT, the fake server running, and the walkthrough
# built for testing into build/walkthrough.
set -euo pipefail

name=$1
size=$2

# Erased every time: the Keychain holds the sign-in, and each run should start
# at onboarding with nothing cached.
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
xcrun simctl install "$SIM_UDID" "$APP_PATH"

mkdir -p "$OUT/$name"
server_lines_before=$(wc -l < "$OUT/server.log")
set +e
TEST_RUNNER_APP_BUNDLE_ID="$APP_BUNDLE_ID" \
TEST_RUNNER_OUTPUT_DIR="$OUT/$name" \
TEST_RUNNER_SERVER_URL="$SERVER_URL" \
  xcodebuild test-without-building \
    -project e2e/ios/Walkthrough.xcodeproj \
    -scheme Walkthrough \
    -destination "id=$SIM_UDID" \
    -derivedDataPath build/walkthrough \
    -resultBundlePath "$OUT/$name.xcresult" \
    > "$OUT/$name.log" 2>&1
status=$?
set -e

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
fi
exit $status
