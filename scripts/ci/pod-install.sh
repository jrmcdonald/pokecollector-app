#!/usr/bin/env bash
# `pod install` for CI, run from the repository root after `expo prebuild`.
#
#   scripts/ci/pod-install.sh <log file> [--no-lock-report]
#
# - Pods resolve from native/Podfile.lock when it exists, so a new release of
#   a pod (expo-image's SDWebImage, say) cannot change the build under an
#   unchanged commit. A lock that no longer matches is reported, with the new
#   one in the log to commit; not for the dev client, which has pods of its
#   own (--no-lock-report).
# - React Native and Hermes check Maven for their prebuilt binaries with one
#   unretried request, and on any answer but 200 quietly build from source:
#   a different, much slower build. That counts as a failure here.
# - Three attempts, for the CocoaPods CDN and Maven.
set -euo pipefail

log=$1
report=${2:-}
lock=native/Podfile.lock

if [ -f "$lock" ]; then
  cp "$lock" ios/Podfile.lock
else
  echo "::warning::No $lock: pods resolve to their newest allowed versions"
fi

for attempt in 1 2 3; do
  status=0
  (cd ios && pod install) 2>&1 | tee "$log" || status=$?
  if [ "$status" -eq 0 ] &&
    grep -qE 'reverting to building from source|\[Hermes\] Using the latest commit' "$log"; then
    echo "::warning::React Native's prebuilt binaries were not found; not building from source"
    status=1
  fi
  [ "$status" -eq 0 ] && break
  if [ "$attempt" -eq 3 ]; then
    echo "::error::pod install failed three times; see the log above"
    exit 1
  fi
  echo "::warning::pod install failed (attempt ${attempt}); trying again"
  sleep 20
done

if [ "$report" = --no-lock-report ]; then
  :
elif [ -f "$lock" ] && ! cmp -s "$lock" ios/Podfile.lock; then
  echo "::warning::$lock is out of date. Commit the Podfile.lock printed below as $lock."
  echo "::group::Podfile.lock"
  cat ios/Podfile.lock
  echo "::endgroup::"
elif [ ! -f "$lock" ]; then
  echo "::group::Podfile.lock, to commit as $lock"
  cat ios/Podfile.lock
  echo "::endgroup::"
fi
