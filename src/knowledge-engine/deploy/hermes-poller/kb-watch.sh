#!/usr/bin/env bash
# KB poller on hermes01: end-to-end probe of onyx01 RAGFlow through the tunnel.
# Posts to Slack ONLY on state transitions (down -> alert, recovered -> all-clear).
# Always logs to journal. Doubles as a dead-man switch over onyx01: tunnel-down,
# box-down, sshd-down, RAGFlow-down all surface here.
set -u
STATE=/opt/kb-watch/state
ENVF=/opt/kb-watch/kb-watch.env          # SLACK_ALERT_CHANNEL=Cxxxx (optional)
PROFILE_ENV=/root/.hermes/profiles/internal/.env
[ -f "$ENVF" ] && . "$ENVF"
TOKEN=$(grep "^SLACK_BOT_TOKEN=" "$PROFILE_ENV" 2>/dev/null | cut -d= -f2-)
KEY=$(grep "^RAGFLOW_API_KEY=" "$PROFILE_ENV" 2>/dev/null | cut -d= -f2-)

status=ok; reasons=()
curl -fsS -m 10 http://127.0.0.1:9380/api/v1/system/ping >/dev/null 2>&1 \
  || { status=critical; reasons+=("RAGFlow ping failed through tunnel"); }
code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 http://127.0.0.1:9382/mcp 2>/dev/null)
case "$code" in 200|405|406) ;; *) status=critical; reasons+=("MCP :9382 unreachable (HTTP $code)");; esac
if [ -n "$KEY" ] && [ "$status" = ok ]; then
  curl -fsS -m 15 -H "Authorization: Bearer $KEY" "http://127.0.0.1:9380/api/v1/datasets?page_size=1" >/dev/null 2>&1 \
    || { status=critical; reasons+=("dataset API failed (ES degraded?)"); }
fi

prev=$(cat "$STATE" 2>/dev/null || echo unknown)
echo "$status" > "$STATE"
msg=""
if [ "$status" != "$prev" ]; then
  if [ "$status" = ok ]; then msg=":white_check_mark: KB engine recovered (onyx01)"; 
  else msg=":rotating_light: KB engine $status (onyx01): ${reasons[*]}"; fi
fi
echo "$(date -Is) status=$status prev=$prev ${reasons[*]:-}"
if [ -n "$msg" ] && [ -n "${SLACK_ALERT_CHANNEL:-}" ] && [ -n "$TOKEN" ]; then
  curl -fsS -m 10 -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"channel\": \"$SLACK_ALERT_CHANNEL\", \"text\": \"$msg\"}" >/dev/null 2>&1 || true
fi
