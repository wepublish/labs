#!/bin/bash
# Benchmark Fire-PDF parsers modes (fast / ocr / auto) on a PDF already
# uploaded to Supabase Storage. Reproduces the 2026-04-15 finding that
# Fire-PDF's default `auto` mode mis-classifies InDesign-export newspapers
# and falls back to OCR hallucination, while `fast` mode yields clean text.
#
# Usage:
#   ./benchmark-pdf-parse-modes.sh <storage_path>
# Example:
#   ./benchmark-pdf-parse-modes.sh 493c6d51531c7444365b0ec094bc2d67/7a4de...pdf

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <storage_path>  (relative path inside the uploads bucket)"
  exit 1
fi

STORAGE_PATH="$1"
SUPABASE_URL="https://ayksajwtwyjhvpqngvcb.supabase.co"
ENV_FILE="/Users/tomvaillant/buried_signals/wepublish/labs/src/dorfkoenig/supabase/functions/.env"
SUPABASE_SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY "$ENV_FILE" | cut -d= -f2)
FIRECRAWL_KEY=$(grep FIRECRAWL_API_KEY "$ENV_FILE" | cut -d= -f2)

OUT=$(mktemp -d)
trap "echo 'Output dir: $OUT'" EXIT

echo "=== Fire-PDF mode benchmark ==="
echo "storage_path: $STORAGE_PATH"
echo ""

for MODE in fast ocr auto; do
  SIGNED=$(curl -sS -X POST \
    "$SUPABASE_URL/storage/v1/object/sign/uploads/$STORAGE_PATH" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"expiresIn": 3600}' | jq -r '.signedURL')
  URL="$SUPABASE_URL/storage/v1$SIGNED"

  START=$(date +%s)
  curl -sS -X POST https://api.firecrawl.dev/v2/scrape \
    -H "Authorization: Bearer $FIRECRAWL_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"$URL\",\"formats\":[\"markdown\"],\"parsers\":[{\"type\":\"pdf\",\"mode\":\"$MODE\"}],\"maxAge\":0,\"timeout\":240000}" \
    > "$OUT/$MODE.json"
  END=$(date +%s)

  jq -r '.data.markdown' "$OUT/$MODE.json" > "$OUT/$MODE.md"
  CHARS=$(wc -c < "$OUT/$MODE.md" | tr -d ' ')
  MARKERS=$(grep -cE "AHA-THEATER|SAMARITER|BASLER GESCHICHTSTAGE|KADETTENKORPS|EINWOHNERRAT|KONZERT|VERNISSAGE|Hochwasserschutz|Wettsteinanlage" "$OUT/$MODE.md" || true)
  DATES=$(grep -cE "[0-9]{1,2}\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*20[0-9]{2}" "$OUT/$MODE.md" || true)
  GARBLE=$(grep -cE "PRITTAG|REHEINZ|Grenzteilbahn|Baumenladen|Iwrkplinderin" "$OUT/$MODE.md" || true)

  echo "mode=$MODE  chars=$CHARS  markers=$MARKERS  dates=$DATES  hallucinations=$GARBLE  elapsed=$((END-START))s"
  sleep 2
done

echo ""
echo "Compare md5 — if fast differs from auto/ocr, mode flag is respected:"
md5 -r "$OUT"/*.md 2>/dev/null || md5sum "$OUT"/*.md
