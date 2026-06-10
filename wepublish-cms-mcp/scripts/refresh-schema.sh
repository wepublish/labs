#!/usr/bin/env bash
# Re-pull the We.Publish admin GraphQL schema (code-first, committed in the public
# repo) into schema/schema-v2.graphql. Run when the upstream schema changes; then
# re-run `npm run codegen` and the test suite to catch contract drift.
set -euo pipefail

REPO="${WEPUBLISH_REPO:-wepublish/wepublish}"
REF="${WEPUBLISH_REF:-development}"
SRC_PATH="${WEPUBLISH_SCHEMA_PATH:-apps/api-example/schema-v2.graphql}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/schema/schema-v2.graphql"

echo "Pulling ${REPO}@${REF}:${SRC_PATH} -> ${DEST}"
gh api "repos/${REPO}/contents/${SRC_PATH}?ref=${REF}" \
  -H "Accept: application/vnd.github.raw" > "$DEST"
echo "Done: $(wc -l < "$DEST") lines. Now run: npm run codegen && npm test"
