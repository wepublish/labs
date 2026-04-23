#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-ayksajwtwyjhvpqngvcb}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is required" >&2
  exit 1
fi

export SUPABASE_URL="${SUPABASE_URL:-https://${PROJECT_REF}.supabase.co}"

if [[ -z "${SUPABASE_ANON_KEY:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required when SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is not set" >&2
    exit 1
  fi

  api_keys="$(supabase projects api-keys --project-ref "$PROJECT_REF" -o json)"

  export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(printf '%s' "$api_keys" | jq -r '.[] | select(.name=="anon") | .api_key')}"
  export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(printf '%s' "$api_keys" | jq -r '.[] | select(.name=="service_role") | .api_key')}"
fi

deno run -A ./src/dorfkoenig/supabase/functions/_tests/smoke/live_scout_pipeline_smoke.ts
deno run -A ./src/dorfkoenig/supabase/functions/_tests/smoke/live_canonical_dedup_smoke.ts
