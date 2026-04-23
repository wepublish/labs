#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/src/dorfkoenig/supabase/migrations"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is required" >&2
  exit 1
fi

duplicate_versions="$(
  find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' -exec basename {} \; |
    sed 's/_.*//' |
    sort |
    uniq -d
)"

if [[ -n "$duplicate_versions" ]]; then
  echo "Duplicate local migration versions detected:" >&2
  printf '  %s\n' $duplicate_versions >&2
  exit 1
fi

output="$(supabase --workdir "$REPO_ROOT/src/dorfkoenig" migration list)"
printf '%s\n' "$output"

drift_lines="$(
  printf '%s\n' "$output" |
    awk -F'|' '
      NF < 3 { next }
      /Local/ { next }
      /---/ { next }
      {
        local_col = $1
        remote_col = $2
        gsub(/[[:space:]]/, "", local_col)
        gsub(/[[:space:]]/, "", remote_col)
        if ((local_col == "" && remote_col != "") || (local_col != "" && remote_col == "")) {
          print $0
        }
      }
    '
)"

if [[ -n "$drift_lines" ]]; then
  echo >&2
  echo "Migration drift detected. Do not run db push until local and remote history are reconciled." >&2
  exit 1
fi

echo
echo "Migration history is clean."
