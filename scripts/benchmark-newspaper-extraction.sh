#!/bin/bash
# Diagnose whether wrong event_dates on extracted newspaper units come from
# Fire-PDF's markdown or from the LLM's interpretation of correct markdown.
#
# The Deno sidecar does the real work (upload → Firecrawl → extract → report).
# This wrapper just loads secrets from the edge-function .env and invokes it.
#
# NEVER add `set -x` — SUPABASE_SERVICE_ROLE_KEY / FIRECRAWL_API_KEY /
# OPENROUTER_API_KEY are loaded into env; `-x` would splash them to stdout.
#
# Usage:
#   ./scripts/benchmark-newspaper-extraction.sh <local_pdf_path>
# Example:
#   ./scripts/benchmark-newspaper-extraction.sh ~/Downloads/awb-kw15-2026.pdf

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <local_pdf_path>"
  exit 1
fi

PDF_PATH="$1"
if [[ ! -f "$PDF_PATH" ]]; then
  echo "File not found: $PDF_PATH"
  exit 1
fi

ENV_FILE="/Users/tomvaillant/buried_signals/wepublish/labs/src/dorfkoenig/supabase/functions/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

# Source the .env so all four keys land in our env for the Deno process.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for V in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY FIRECRAWL_API_KEY OPENROUTER_API_KEY; do
  if [[ -z "${!V:-}" ]]; then
    echo "Missing $V in $ENV_FILE"
    exit 1
  fi
done

echo "Using PROD service key — Ctrl+C within 3 s."
sleep 3

OUT=$(mktemp -d)
trap 'echo ""; echo "=== Output dir: $OUT ==="; echo "WARN: report may contain private content from the source PDF; do not commit."' EXIT

deno run --allow-net --allow-env --allow-read \
  --allow-write="$OUT" \
  "$(dirname "$0")/benchmark-newspaper-extraction.ts" \
  "$PDF_PATH" "$OUT"

echo ""
echo "=== Report ==="
echo "$OUT/report.md"
