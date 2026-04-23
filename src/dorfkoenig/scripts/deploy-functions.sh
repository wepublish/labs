#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PROJECT_REF="${SUPABASE_PROJECT_REF:-ayksajwtwyjhvpqngvcb}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is required" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: npm run deploy:dorfkoenig:function -- <function> [more functions...]" >&2
  exit 1
fi

for fn in "$@"; do
  echo "Deploying $fn to $PROJECT_REF"
  supabase --workdir "$REPO_ROOT/src/dorfkoenig" functions deploy "$fn" --no-verify-jwt --project-ref "$PROJECT_REF"
done
