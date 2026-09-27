#!/usr/bin/env bash
# Exports the OpenAPI spec of a PokeCollector release into openapi/.
#
#   scripts/export-openapi.sh 1.51.0
#
# Use the version the ha-addons pokecollector Dockerfile pins, so the app is
# typed against what is actually running. FastAPI builds the spec from the
# route definitions alone, so this needs no database and no network beyond
# pulling the image.
set -euo pipefail

version=${1:?usage: $0 <upstream version, e.g. 1.51.0>}
image="ghcr.io/git-romer/pokecollector-backend:${version}"
out="$(cd "$(dirname "$0")/.." && pwd)/openapi/pokecollector-${version}.json"

# DATA_DIR is where the backend persists its JWT signing key on import; point
# it somewhere disposable. Logging goes to stderr, so stdout is the spec alone.
docker run --rm --entrypoint python -e DATA_DIR=/tmp/pokecollector "${image}" -c '
import json, sys
import main
json.dump(main.app.openapi(), sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
' > "${out}.tmp"
mv "${out}.tmp" "${out}"

echo "Wrote ${out}"
echo "Now point the generate:api script in package.json at it and run: npm run generate:api"
