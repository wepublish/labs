#!/usr/bin/env bash
# provision-onyx01.sh — runs ON onyx01. Installs Docker + RAGFlow (headless) with
# every boot fix from BAKEOFF_RESULTS.md baked in. Idempotent: safe to re-run.
#
# Boot fixes baked in (see BAKEOFF_RESULTS.md):
#   1. Use the BASE docker-compose.yml (never the macOS source-build override) so the
#      prebuilt image is pulled, not compiled.
#   2. Set INIT_MODEL_PROVIDER_TABLES=0 — the v0.25.6 image crash-loops on a fresh DB
#      because the model-provider migration needs a tools/ dir absent from the image.
#   3. Use the FULL image (no -slim) so bge-m3 embeddings are available locally.
#   4. vm.max_map_count >= 262144 (Elasticsearch hard requirement).
#   5. RAGFlow runs RETRIEVAL-ONLY: no chat LLM is configured (generation is OpenRouter
#      inside Hermes). configure-ragflow.py therefore never sets a tenant chat model and
#      callers must NOT pass keyword:true to /retrieval.
set -euo pipefail

# ---- config (bake-off-validated; bump RAGFLOW_VER after a first clean deploy) --------
RAGFLOW_VER="${RAGFLOW_VER:-v0.25.6}"
INSTALL_DIR="${INSTALL_DIR:-/opt/ragflow}"
STATE_DIR="${STATE_DIR:-/opt/ragflow-deploy}"
MIN_RAM_GB="${MIN_RAM_GB:-15}"        # RAGFlow stack floor; CPX51 = 32 GB
ES_MEM_LIMIT="${ES_MEM_LIMIT:-3221225472}"   # 3 GiB ES cgroup + pinned 1g heap (HNSW lives off-heap) — good to ~200K chunks

log()  { printf '\033[1;36m[provision]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[provision][FATAL]\033[0m %s\n' "$*" >&2; exit 1; }

# ---- preflight ----------------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || die "must run as root"
[ "$(uname -m)" = "x86_64" ] || die "RAGFlow images are amd64-only; arch is $(uname -m)"

ram_gb=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
log "detected ${ram_gb} GiB RAM, $(nproc) vCPU"
if [ "$ram_gb" -lt "$MIN_RAM_GB" ]; then
  die "only ${ram_gb} GiB RAM; RAGFlow needs >= ${MIN_RAM_GB} GiB. Resize onyx01 to CPX51 (32 GB) in the Hetzner console first, then re-run."
fi

disk_free_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
[ "${disk_free_gb:-0}" -ge 40 ] || die "only ${disk_free_gb} GiB free on /; need >= 40 GiB (ES indices + MinIO + image + models)"

mkdir -p "$STATE_DIR"

# ---- kernel tunables (ES) -----------------------------------------------------------
if [ "$(sysctl -n vm.max_map_count)" -lt 262144 ]; then
  log "setting vm.max_map_count=262144"
  sysctl -w vm.max_map_count=262144
  printf 'vm.max_map_count=262144\n' > /etc/sysctl.d/99-ragflow.conf
fi

# ---- Docker -------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker Engine + compose plugin"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "Docker present: $(docker --version)"
fi
docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"

# ---- firewall (RAGFlow stays private; Hermes reaches it over private net/tunnel) -----
if command -v ufw >/dev/null 2>&1; then
  log "configuring ufw (allow SSH only; RAGFlow ports stay closed to the public)"
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
fi

# ---- fetch RAGFlow at the pinned tag -------------------------------------------------
if [ ! -d "$INSTALL_DIR/.git" ]; then
  log "cloning RAGFlow ${RAGFLOW_VER} -> ${INSTALL_DIR}"
  git clone --depth 1 --branch "$RAGFLOW_VER" https://github.com/infiniflow/ragflow.git "$INSTALL_DIR" \
    || die "clone failed — does tag ${RAGFLOW_VER} exist? Set RAGFLOW_VER to a real release tag."
else
  log "RAGFlow checkout exists at ${INSTALL_DIR} (leaving as-is)"
fi

COMPOSE_DIR="$INSTALL_DIR/docker"
ENV_FILE="$COMPOSE_DIR/.env"
[ -f "$COMPOSE_DIR/docker-compose.yml" ] || die "base docker-compose.yml not found in $COMPOSE_DIR"

# ---- configure .env (idempotent; generate secrets once) ------------------------------
if [ ! -f "$STATE_DIR/.env.generated" ]; then
  log "writing .env with boot fixes + generated secrets"
  # no early-exit pipe readers: tr|head-c on urandom dies of SIGPIPE under pipefail
  gen() { local h; h="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"; printf '%s' "${h:0:28}"; }
  MYSQL_PW="$(gen)"; MINIO_PW="$(gen)"; REDIS_PW="$(gen)"

  set_kv() { # set_kv KEY VALUE  (replace if present, else append)
    local k="$1" v="$2"
    if grep -qE "^${k}=" "$ENV_FILE"; then
      sed -i "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
    else
      printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"
    fi
  }
  # FULL image (drop any -slim suffix)
  set_kv RAGFLOW_IMAGE "infiniflow/ragflow:${RAGFLOW_VER}"
  set_kv MEM_LIMIT "$ES_MEM_LIMIT"
  set_kv INIT_MODEL_PROVIDER_TABLES "0"      # boot fix #2
  # v0.25.6 dropped in-process embeddings: local models run in a TEI sidecar
  # (Builtin factory proxies to it). Enable tei-cpu with bge-m3 (multilingual).
  set_kv COMPOSE_PROFILES '${DOC_ENGINE},${DEVICE},tei-cpu'
  set_kv TEI_MODEL "BAAI/bge-m3"
  set_kv MYSQL_PASSWORD "$MYSQL_PW"
  set_kv MINIO_PASSWORD "$MINIO_PW"
  set_kv REDIS_PASSWORD "$REDIS_PW"

  # Bind every published port to loopback. Docker's iptables chains BYPASS ufw,
  # so a plain "PORT:PORT" binding is publicly reachable despite the firewall.
  # The compose files use "${VAR}:containerport", so prefixing the host var with
  # 127.0.0.1: yields a loopback-only "127.0.0.1:host:container" binding.
  for pv in ES_PORT OS_PORT KIBANA_PORT INFINITY_THRIFT_PORT INFINITY_HTTP_PORT \
            INFINITY_PSQL_PORT EXPOSE_MYSQL_PORT MINIO_PORT MINIO_CONSOLE_PORT \
            REDIS_PORT TEI_PORT SVR_WEB_HTTP_PORT SVR_WEB_HTTPS_PORT SVR_HTTP_PORT \
            ADMIN_SVR_HTTP_PORT SVR_MCP_PORT GO_HTTP_PORT GO_ADMIN_PORT; do
    cur="$(grep -E "^${pv}=" "$ENV_FILE" | head -1 | cut -d= -f2 || true)"
    case "$cur" in
      127.0.0.1:*|"") ;;                       # already loopback / absent in this tag
      *) set_kv "$pv" "127.0.0.1:${cur}" ;;
    esac
  done

  # stash secrets for ops (root-only)
  umask 077
  cat > "$STATE_DIR/secrets.env" <<EOF
# generated $(date -u +%FT%TZ) — onyx01 RAGFlow service secrets (root-only)
MYSQL_PASSWORD=$MYSQL_PW
MINIO_PASSWORD=$MINIO_PW
REDIS_PASSWORD=$REDIS_PW
EOF
  touch "$STATE_DIR/.env.generated"
else
  log ".env already generated (leaving secrets intact)"
fi

# ---- TEI + ES resource override (adversarially reviewed 2026-06-11) -----------------
# TEI: default max_batch_tokens=16384 warms up one [2,16,8192,8192] fp32 attention
# tensor (~8.6 GiB) -> kernel OOM-kill on a 16 GB box. 2048 + the max_seq_length
# clamp below caps warmup AND closes a queue livelock: inputs tokenizing past
# max_batch_tokens but under the model max (8192) can never be scheduled and
# head-of-line block embedding for 30 s. The clamp makes --auto-truncate cut at
# 2048, so nothing unschedulable exists. Do NOT add --max-client-batch-size < 16
# (RAGFlow hardcodes embed batches of 16 -> 413 on every ingest) or lower
# --max-concurrent-requests (rejects live queries during ingest; saves nothing).
cat > "$COMPOSE_DIR/tei-sentence-bert-config.json" <<'EOF'
{
  "max_seq_length": 2048,
  "do_lower_case": false
}
EOF
cat > "$COMPOSE_DIR/docker-compose-tei.yml" <<'EOF'
# Local resource overrides (TEI + ES). Included via COMPOSE_FILE in .env.
services:
  tei-cpu:
    command: ["--model-id", "/data/${TEI_MODEL}", "--auto-truncate",
              "--max-batch-tokens", "2048",
              "--tokenization-workers", "2"]
    environment:
      - MALLOC_ARENA_MAX=2
    volumes:
      - ./tei-sentence-bert-config.json:/data/BAAI/bge-m3/sentence_bert_config.json:ro
    mem_limit: 6g
    memswap_limit: 6g
  es01:
    # memswap == mem -> ES never swaps (swapped JVM heap = minutes-long GC pauses);
    # it dies fast on overrun and the restart policy recovers it
    memswap_limit: ${MEM_LIMIT}
EOF

# pinned ES heap: auto-sizing (50% of cgroup) wastes the page-cache budget HNSW needs
grep -qE "^ES_JAVA_OPTS=" "$ENV_FILE" || printf 'ES_JAVA_OPTS=-Xms1g -Xmx1g\n' >> "$ENV_FILE"
# COMPOSE_FILE makes a bare "docker compose up -d" correct by default — the
# structural fix for the omitted-override-file footgun
grep -qE "^COMPOSE_FILE=" "$ENV_FILE" || \
  printf 'COMPOSE_FILE=docker-compose.yml:docker-compose-tei.yml:docker-compose-mcp.yml\n' >> "$ENV_FILE"

# ---- docker log rotation (crash-loop spew must not fill the disk ES needs) ----------
if [ ! -f /etc/docker/daemon.json ]; then
  printf '{"log-driver": "json-file", "log-opts": {"max-size": "50m", "max-file": "3"}}\n' > /etc/docker/daemon.json
  systemctl restart docker
fi

# ---- swap: 3 GB insurance, low swappiness (ES itself is excluded via memswap) -------
if [ ! -f /swapfile ]; then
  fallocate -l 3G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
grep -q swappiness /etc/sysctl.d/99-ragflow.conf 2>/dev/null || echo "vm.swappiness=10" >> /etc/sysctl.d/99-ragflow.conf
grep -q max_map_count /etc/sysctl.d/99-ragflow.conf || echo "vm.max_map_count=1048576" >> /etc/sysctl.d/99-ragflow.conf

# ---- watchdog + nightly MySQL backup (watchdog.py scp'd next to this script) --------
mkdir -p "$STATE_DIR/backups"
if [ -f /root/watchdog.py ]; then
  install -m 755 /root/watchdog.py "$STATE_DIR/watchdog.py"
  cat > /etc/cron.d/kb-watchdog <<EOF
*/10 * * * * root flock -n /run/kb-watchdog.lock timeout 120 /usr/bin/python3 $STATE_DIR/watchdog.py >> /var/log/kb-watchdog.log 2>&1
EOF
fi
cat > /etc/cron.d/kb-backup <<'EOF'
17 3 * * * root docker exec docker-mysql-1 sh -c "exec mysqldump -uroot -p\"$MYSQL_ROOT_PASSWORD\" --all-databases" | gzip > /opt/ragflow-deploy/backups/mysql-$(date +\%F).sql.gz 2>> /var/log/kb-backup.log && find /opt/ragflow-deploy/backups -name "mysql-*.sql.gz" -mtime +14 -delete
EOF
chmod 644 /etc/cron.d/kb-watchdog /etc/cron.d/kb-backup 2>/dev/null || true

# ---- bring up the stack (BASE compose — boot fix #1) --------------------------------
log "pulling + starting RAGFlow (this is slow on first run — image is several GB)"
cd "$COMPOSE_DIR"
# COMPOSE_FILE in .env carries the override files; bare up -d is correct.
# MCP override may not exist pre-configure — trim COMPOSE_FILE to what exists.
if [ ! -f "$COMPOSE_DIR/docker-compose-mcp.yml" ]; then
  docker compose -f docker-compose.yml -f docker-compose-tei.yml --env-file .env up -d
else
  docker compose --env-file .env up -d
fi

# ---- health wait --------------------------------------------------------------------
log "waiting for RAGFlow server on :9380 (up to 10 min while it initialises)"
for i in $(seq 1 120); do
  # v0.25.6 serves everything under /api/v1; /system/ping is unauthenticated
  if curl -fsS "http://localhost:9380/api/v1/system/ping" >/dev/null 2>&1; then
    log "RAGFlow responding after ~$((i*5))s"
    docker compose ps
    log "PROVISION OK. Next: run configure-ragflow.py on this host."
    exit 0
  fi
  sleep 5
done
docker compose ps
docker compose logs --tail=40 ragflow-server 2>/dev/null || true
die "RAGFlow did not become healthy in 10 min — inspect 'docker compose logs ragflow-server' in $COMPOSE_DIR"
