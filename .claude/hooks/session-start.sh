#!/bin/bash
# Gets a Claude Code on the web session ready to lint, typecheck and test.
# Synchronous on purpose: the checks CLAUDE.md asks for need node_modules.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# The web network policy blocks api.expo.dev, so every expo command must use
# the version map bundled in the expo package instead of asking the API.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo 'export EXPO_OFFLINE=1'
    echo 'export EXPO_NO_TELEMETRY=1'
  } >> "$CLAUDE_ENV_FILE"
fi

# install rather than ci: it reuses a node_modules the container cache kept,
# and is a no-op when nothing changed.
npm install --no-audit --no-fund
