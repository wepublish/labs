# RAGFlow deploy — onyx01

Hardened, idempotent deploy of headless RAGFlow behind Hermes. Bakes in every
boot fix from `../specs/BAKEOFF_RESULTS.md`. Architecture: `../specs/AI_SUPPORT_ARCHITECTURE_SPEC.md`.

## Prerequisite (hard gate)

`onyx01` must be **resized to ≥16 GB — CPX41 (8 vCPU / 16 GB / 240 GB)** in the
Hetzner console **before** deploying (CPX51/32 GB only for heavy ingestion). As of
last check it is **2 vCPU / 3.7 GB** — RAGFlow's stack (ES/Infinity + MySQL + MinIO
+ Redis + server) needs ~16 GB. `deploy.sh` **refuses to run** below 15 GB, so it
fails safe on the small box and just works once you resize. Docker is **not yet
installed** on the box; the script installs it.

**Why 16 GB even though the LLM is OpenRouter:** OpenRouter offloads only the chat
model. RAM is consumed locally by Elasticsearch (the floor — it *OOM-crashes*, it
does not "run slow", below its heap), the `bge-m3` embedding model (~2.3 GB, run on
the host for every ingest and query — OpenRouter has no embeddings), DeepDoc
parsing models, plus MySQL/MinIO/Redis. To attempt 8 GB you must also move
embeddings to an external API + use the Infinity engine + naive chunking (risky).

> The script intentionally still names CPX51 in one preflight message; the real
> minimum is CPX41/16 GB. The 15 GB gate is correct either way.

## Run (from the laptop)

```bash
cd src/knowledge-engine/deploy
./deploy.sh                # full: provision + headless config + MCP enable
./deploy.sh --provision    # Docker + RAGFlow up only
./deploy.sh --configure    # datasets + API key only (RAGFlow already up)
./deploy.sh --enable-mcp   # MCP server only (requires the minted API key on the box)
```

Uses `~/.ssh/wepublish_hetzner_ed25519` → `root@onyx01.wepublish.cloud`.

## What it does

1. **`deploy.sh`** (laptop) — size-gate preflight → scp scripts → run provision → run configure → pull the API key back to `.secrets/` → enable the MCP server.
2. **`provision-onyx01.sh`** (on box) — preflight (RAM/disk/arch) · `vm.max_map_count` · install Docker · `git clone` RAGFlow at the pinned tag · write `.env` (full image, `INIT_MODEL_PROVIDER_TABLES=0`, generated MySQL/MinIO/Redis secrets, ES mem limit, **all published ports rebound to `127.0.0.1:`**) · `docker compose up -d` on the **base** compose · health-wait.
3. **`configure-ragflow.py`** (on box) — encrypt pw via RAGFlow's own `crypt()` · register admin + login · mint `/system/tokens` API key · create datasets `public` / `internal` / `newsroom:pilot` with `bge-m3` · save + print the key. Auto-detects the server container (`ragflow-cpu` in v0.25.6; no `container_name` in that tag's compose).
4. **`--enable-mcp`** (deploy.sh stage) — writes `docker-compose-mcp.yml` override on the box (built-in RAGFlow MCP server, **self-host** mode with the minted key, streamable HTTP) and recreates the server. Provision re-runs include the override automatically if present.

## Port exposure (why loopback, not ufw)

Docker's iptables chains **bypass ufw** — published `host:container` ports are publicly
reachable even with ufw "allowing SSH only". The provision script therefore rewrites
every `*_PORT` host var in `.env` to `127.0.0.1:<port>`, which the compose interpolates
into loopback-only bindings. Nothing RAGFlow is reachable from outside the box; access
is SSH only (ufw stays on as defense for non-Docker services).

## MCP + agent access (`wp-kb`)

- **MCP (retrieval only):** RAGFlow's built-in MCP server exposes `ragflow_retrieval`
  on `127.0.0.1:9382/mcp` (streamable HTTP). From the laptop: `../tools/wp-kb tunnel`, then any
  MCP client uses `http://127.0.0.1:9382/mcp` — already registered as `ragflow-kb` in
  `wepublish/.mcp.json`. Self-host mode = the server holds the key; the loopback/tunnel
  boundary is the auth. Ingestion and health are **not** MCP tools in RAGFlow.
- **`wp-kb` CLI (in `../tools/`) — health, ingest, query:** runs API calls on the box over SSH, so any
  agent with the SSH key can `wp-kb health`, `wp-kb ingest <file> <dataset>`,
  `wp-kb query "<q>" [dataset ...]` — no tunnel needed. This is the IT-side access path;
  Hermes keeps its own scoped skills (kb-ingest) and remains the newsroom-facing boundary.

## Boot fixes baked in (from `BAKEOFF_RESULTS.md` + the 2026-06-11 first deploy)

- Base `docker-compose.yml`, never the macOS source-build override (pull, don't compile).
- `INIT_MODEL_PROVIDER_TABLES=0` — avoids the v0.25.6 fresh-DB migration crash-loop (missing `tools/`).
- `vm.max_map_count=262144` for Elasticsearch.
- Headless auth = RSA-PKCS1v15(base64(pw)) via the container's `crypt()`; mint a `/system/tokens` key for `/retrieval`.
- **Retrieval-only**: no chat LLM in RAGFlow (generation is OpenRouter in Hermes) → callers must **not** pass `keyword:true` to `/retrieval`.

### v0.25.6 realities (found on the first live deploy, 2026-06-11)

- **API restructured**: everything lives under `/api/v1/...` (`/api/v1/users`,
  `/api/v1/auth/login` — token in the *lowercase* `authorization` response header —
  `/api/v1/system/tokens`, `/api/v1/system/ping` for health). The old `/v1/user/*`
  bake-off routes 404. Bearer API keys authenticate `@login_required` routes too.
- **No in-process embeddings anymore** ("full image bundles bge-m3" is stale): local
  embedding = **TEI sidecar** (`tei-cpu` compose profile, `TEI_MODEL=BAAI/bge-m3`,
  dataset `embedding_model: "BAAI/bge-m3"@Builtin`). TEI's default
  `max_batch_tokens=16384` warms up at ~9 GB RSS → kernel OOM-kill on a 16 GB box;
  `docker-compose-tei.yml` caps it at 4096 (loads in ~10 s, ~6 GB steady).
- **ES capped at 4 GiB** (`MEM_LIMIT`) — plenty at this KB's scale and needed to make
  room for TEI. Box budget ≈ TEI 6 + ES 4 + RAGFlow 3.3 + MySQL/MinIO/Redis 0.6 of 15.6 GiB:
  tight but stable. If ingestion pressure shows, CPX51/32 GB is the next step.
- No `container_name` in this tag's compose — the server container is
  `docker-ragflow-cpu-1` (configure script auto-detects).
- `tr ... </dev/urandom | head -c` dies of SIGPIPE under `set -o pipefail` — secret
  generation uses `od` + substring instead.

## After deploy

- API key → `.secrets/ragflow-api-key.txt`. Feed to Hermes as `RAGFLOW_API_KEY`; Hermes calls `/api/v1/retrieval` with `dataset_ids` scoped per namespace.
- RAGFlow ports are **loopback-only** (see "Port exposure" above). Wire Hermes→RAGFlow over an SSH tunnel from hermes01 (or rebind to the Hetzner private-net IP later) — **open infra decision**, not done here.
- `RAGFLOW_VER` is pinned to the bake-off-validated tag; bump it after a first clean deploy.

## Verify-on-first-run

The deterministic half (Docker, compose, health) is solid. The API-config half
(`configure-ragflow.py` register/login/token/dataset shapes) is reconstructed from
the bake-off — confirm endpoint responses on the first real run against the resized
box and adjust if a RAGFlow upgrade moved them.

## Secrets

`.secrets/` holds the generated admin password + pulled API key when these scripts
run. Gitignored (see `.gitignore` in this directory) — verify with
`git check-ignore -v .secrets/` before any commit. The canonical copies live on the
boxes (`/opt/ragflow-deploy/`). Never commit; never paste the SSH private key.
