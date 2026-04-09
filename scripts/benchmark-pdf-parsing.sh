#!/bin/bash
# Benchmark PDF parsing: Firecrawl vs LlamaParse
# Tests the Birseck_Dorneck Wochenblatt PDF

set -euo pipefail

PDF_PATH="/Users/tomvaillant/buried_signals/wepublish/Birseck_Dorneck.pdf"
OUTPUT_DIR="/Users/tomvaillant/buried_signals/wepublish/labs/scripts/benchmark-output"
mkdir -p "$OUTPUT_DIR"

# Load keys from edge function .env
SUPABASE_URL="https://ayksajwtwyjhvpqngvcb.supabase.co"
SUPABASE_SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/tomvaillant/buried_signals/wepublish/labs/src/dorfkoenig/supabase/functions/.env | cut -d= -f2)
FIRECRAWL_KEY=$(grep FIRECRAWL_API_KEY /Users/tomvaillant/buried_signals/wepublish/labs/src/dorfkoenig/supabase/functions/.env | cut -d= -f2)
LLAMAPARSE_KEY=$(grep LLAMAPARSE_API_KEY /Users/tomvaillant/buried_signals/tools/cojournalist/.env | cut -d= -f2)

echo "=== PDF Parsing Benchmark ==="
echo "PDF: $(basename $PDF_PATH) ($(du -h $PDF_PATH | cut -f1))"
echo ""

# ── Step 1: Upload PDF to Supabase Storage ──
echo "--- Step 1: Uploading PDF to Supabase Storage ---"
STORAGE_PATH="benchmark/wochenblatt-test-$(date +%s).pdf"

UPLOAD_RESULT=$(curl -s -w "\n%{http_code}" \
  -X POST "${SUPABASE_URL}/storage/v1/object/uploads/${STORAGE_PATH}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/pdf" \
  --data-binary "@${PDF_PATH}")

UPLOAD_STATUS=$(echo "$UPLOAD_RESULT" | tail -n1)
echo "Upload status: $UPLOAD_STATUS"

if [ "$UPLOAD_STATUS" != "200" ]; then
  echo "Upload failed. Response:"
  echo "$UPLOAD_RESULT" | head -n -1
  echo ""
  echo "Trying alternative: creating signed upload URL..."

  # Try creating a signed upload URL first
  SIGNED_UPLOAD=$(curl -s \
    -X POST "${SUPABASE_URL}/storage/v1/object/upload/sign/uploads/${STORAGE_PATH}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')

  echo "Signed upload response: $SIGNED_UPLOAD"
fi

# ── Step 2: Get signed download URL ──
echo ""
echo "--- Step 2: Getting signed download URL ---"
SIGNED_URL_RESULT=$(curl -s \
  -X POST "${SUPABASE_URL}/storage/v1/object/sign/uploads/${STORAGE_PATH}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"expiresIn": 3600}')

echo "Signed URL response: $SIGNED_URL_RESULT"
SIGNED_PATH=$(echo "$SIGNED_URL_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('signedURL',''))" 2>/dev/null || echo "")

if [ -n "$SIGNED_PATH" ]; then
  FULL_SIGNED_URL="${SUPABASE_URL}/storage/v1${SIGNED_PATH}"
  echo "Full signed URL: $FULL_SIGNED_URL"
else
  echo "Could not get signed URL. Will skip Firecrawl test."
  FULL_SIGNED_URL=""
fi

# ── Step 3: Test Firecrawl ──
echo ""
echo "--- Step 3: Testing Firecrawl PDF parsing ---"
if [ -n "$FULL_SIGNED_URL" ]; then
  FC_START=$(date +%s)

  FC_RESULT=$(curl -s \
    -X POST "https://api.firecrawl.dev/v2/scrape" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${FIRECRAWL_KEY}" \
    -d "{\"url\": \"${FULL_SIGNED_URL}\", \"formats\": [\"markdown\"]}" \
    --max-time 120)

  FC_END=$(date +%s)
  FC_DURATION=$((FC_END - FC_START))

  # Extract markdown and save
  echo "$FC_RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
success = data.get('success', False)
print(f'Success: {success}')
if success and 'data' in data:
    md = data['data'].get('markdown', '')
    print(f'Markdown length: {len(md)} chars')
    print(f'First 2000 chars:')
    print(md[:2000])
    with open('$OUTPUT_DIR/firecrawl-full.md', 'w') as f:
        f.write(md)
    print(f'\nFull output saved to $OUTPUT_DIR/firecrawl-full.md')
else:
    print(f'Error: {data.get(\"error\", \"unknown\")}')
    print(json.dumps(data, indent=2)[:1000])
" 2>&1

  echo "Duration: ${FC_DURATION}s"
else
  echo "Skipped (no URL available)"
fi

# ── Step 4: Test LlamaParse ──
echo ""
echo "--- Step 4: Testing LlamaParse PDF parsing ---"
LP_START=$(date +%s)

# Upload to LlamaParse
LP_UPLOAD=$(curl -s \
  -X POST "https://api.cloud.llamaindex.ai/api/parsing/upload" \
  -H "Authorization: Bearer ${LLAMAPARSE_KEY}" \
  -F "file=@${PDF_PATH}" \
  -F "result_type=markdown" \
  -F "language=de" \
  --max-time 60)

echo "LlamaParse upload response: $(echo "$LP_UPLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'ID: {d.get(\"id\",\"?\")}, Status: {d.get(\"status\",\"?\")}')" 2>/dev/null || echo "$LP_UPLOAD" | head -c 500)"

LP_JOB_ID=$(echo "$LP_UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

if [ -n "$LP_JOB_ID" ]; then
  echo "Job ID: $LP_JOB_ID"
  echo "Polling for result..."

  for i in $(seq 1 30); do
    sleep 5
    LP_STATUS=$(curl -s \
      -X GET "https://api.cloud.llamaindex.ai/api/parsing/job/${LP_JOB_ID}" \
      -H "Authorization: Bearer ${LLAMAPARSE_KEY}")

    STATUS=$(echo "$LP_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "unknown")
    echo "  Poll $i: status=$STATUS"

    if [ "$STATUS" = "SUCCESS" ]; then
      # Get the result
      LP_RESULT=$(curl -s \
        -X GET "https://api.cloud.llamaindex.ai/api/parsing/job/${LP_JOB_ID}/result/markdown" \
        -H "Authorization: Bearer ${LLAMAPARSE_KEY}")

      echo "$LP_RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    md = data.get('markdown', '')
    print(f'Markdown length: {len(md)} chars')
    print(f'First 2000 chars:')
    print(md[:2000])
    with open('$OUTPUT_DIR/llamaparse-full.md', 'w') as f:
        f.write(md)
    print(f'\nFull output saved to $OUTPUT_DIR/llamaparse-full.md')
except:
    text = sys.stdin.read() if not data else str(data)
    print(f'Raw length: {len(text)} chars')
    print(text[:2000])
    with open('$OUTPUT_DIR/llamaparse-full.md', 'w') as f:
        f.write(text)
" 2>&1
      break
    elif [ "$STATUS" = "ERROR" ]; then
      echo "LlamaParse failed: $LP_STATUS"
      break
    fi
  done

  LP_END=$(date +%s)
  LP_DURATION=$((LP_END - LP_START))
  echo "Duration: ${LP_DURATION}s"
else
  echo "LlamaParse upload failed"
fi

# ── Step 5: Cleanup ──
echo ""
echo "--- Cleanup ---"
curl -s -X DELETE "${SUPABASE_URL}/storage/v1/object/uploads/${STORAGE_PATH}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" > /dev/null 2>&1
echo "Cleaned up storage file"

echo ""
echo "=== Benchmark Complete ==="
echo "Results saved in: $OUTPUT_DIR/"
echo "  - firecrawl-full.md"
echo "  - llamaparse-full.md"
