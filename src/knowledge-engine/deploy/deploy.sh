#!/usr/bin/env bash
# deploy.sh — laptop-side orchestrator for the RAGFlow deploy on onyx01.
#
# Fails SAFE: if onyx01 is not yet resized (RAM < 15 GB) it refuses to deploy,
# so it never thrashes the current 4 GB box. Resize onyx01 -> CPX51 in the
# Hetzner console first, then run this.
#
#   ./deploy.sh                 # full deploy (provision + headless config)
#   ./deploy.sh --provision     # provision only (Docker + RAGFlow up)
#   ./deploy.sh --configure     # headless config only (datasets + API key)
set -euo pipefail

HOST="${HOST:-onyx01.wepublish.cloud}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/wepublish_hetzner_ed25519}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@wepublish.ch}"
MIN_RAM_GB="${MIN_RAM_GB:-15}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS="$HERE/.secrets"
mkdir -p "$SECRETS"; chmod 700 "$SECRETS"

SSH=(ssh -i "$SSH_KEY" -o ConnectTimeout=15 -o BatchMode=yes "root@$HOST")
SCP=(scp -i "$SSH_KEY" -o ConnectTimeout=15 -o BatchMode=yes)

log() { printf '\033[1;35m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy][FATAL]\033[0m %s\n' "$*" >&2; exit 1; }

MODE="${1:-full}"

# ---- preflight: size gate (the hard guard) -----------------------------------------
log "checking $HOST size before doing anything"
ram_gb="$("${SSH[@]}" 'awk "/MemTotal/ {printf \"%d\", \$2/1024/1024}" /proc/meminfo')" \
  || die "cannot SSH to $HOST (key: $SSH_KEY)"
log "$HOST has ${ram_gb} GiB RAM"
if [ "${ram_gb:-0}" -lt "$MIN_RAM_GB" ]; then
  die "$HOST has only ${ram_gb} GiB — RAGFlow needs >= ${MIN_RAM_GB} GiB.
       Resize onyx01 -> CPX51 (16 vCPU / 32 GB) in the Hetzner console, then re-run.
       (No changes made.)"
fi

# ---- admin password (generate once, reuse) -----------------------------------------
PW_FILE="$SECRETS/ragflow-admin-password.txt"
if [ ! -f "$PW_FILE" ]; then
  # no early-exit pipe readers: tr|head-c on urandom dies of SIGPIPE under pipefail
  pw_hex="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  printf '%s' "${pw_hex:0:28}" > "$PW_FILE"
  chmod 600 "$PW_FILE"
  log "generated admin password -> $PW_FILE"
fi
ADMIN_PW="$(cat "$PW_FILE")"

provision() {
  log "copying scripts to $HOST"
  "${SCP[@]}" "$HERE/provision-onyx01.sh" "$HERE/configure-ragflow.py" "$HERE/watchdog.py" "root@$HOST:/root/"
  log "running provision-onyx01.sh (Docker install + RAGFlow up — slow on first run)"
  "${SSH[@]}" 'bash /root/provision-onyx01.sh'
}

configure() {
  log "running configure-ragflow.py (datasets + API key)"
  "${SSH[@]}" "python3 /root/configure-ragflow.py --email '$ADMIN_EMAIL' --password '$ADMIN_PW'"
  log "pulling API key + service secrets back to $SECRETS"
  "${SCP[@]}" "root@$HOST:/opt/ragflow-deploy/ragflow-api-key.txt" "$SECRETS/" 2>/dev/null \
    && chmod 600 "$SECRETS/ragflow-api-key.txt" \
    && log "RAGFlow API key saved -> $SECRETS/ragflow-api-key.txt (feed to Hermes as RAGFLOW_API_KEY)" \
    || log "(no API key file pulled — check configure output above)"
}

enable_mcp() {
  log "enabling RAGFlow MCP server (self-host mode, streamable HTTP, loopback :9382)"
  "${SSH[@]}" 'bash -s' <<'EOSH'
set -euo pipefail
KEY="$(cat /opt/ragflow-deploy/ragflow-api-key.txt)"
# self-host mode: the server holds the API key and uses it for every request, so
# streamable HTTP works (host mode does not support it in v0.25.6). Reachable only
# via loopback (SVR_MCP_PORT is bound to 127.0.0.1) -> SSH tunnel from clients.
# no --enable-adminserver: unused in headless mode (UI/MCP/configure never call
# :9381) and its full api.db import graph idles at 300-700 MB
cat > /opt/ragflow/docker/docker-compose-mcp.yml <<EOF
services:
  ragflow-cpu:
    command:
      - --enable-mcpserver
      - --mcp-host=0.0.0.0
      - --mcp-port=9382
      - --mcp-base-url=http://127.0.0.1:9380
      - --mcp-script-path=/ragflow/mcp/server/server.py
      - --mcp-mode=self-host
      - --mcp-host-api-key=${KEY}
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9380/api/v1/system/ping >/dev/null || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s
    mem_limit: 6g
    memswap_limit: 8g
EOF
cd /opt/ragflow/docker
docker compose --env-file .env up -d   # COMPOSE_FILE in .env carries all override files
EOSH
  log "MCP server enabled — tunnel with: ssh -i $SSH_KEY -fN -L 9382:127.0.0.1:9382 root@$HOST"
}

case "$MODE" in
  full)         provision; configure; enable_mcp ;;
  --provision)  provision ;;
  --configure)  configure ;;
  --enable-mcp) enable_mcp ;;
  *) die "usage: $0 [--provision|--configure|--enable-mcp]   (default: full)" ;;
esac

log "DONE. RAGFlow is headless on $HOST (private). Next: point Hermes at /api/v1/retrieval with the Bearer key."
