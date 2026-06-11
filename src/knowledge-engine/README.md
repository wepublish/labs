# Knowledge engine — RAGFlow on `onyx01`

Documentation project for the We.Publish knowledge base: how developers and IT
query it, ingest into it, and operate it. Not an app — nothing here is built or
deployed by the monorepo. Hermes configuration and the agent-side skills
(`kb-ingest`, `kb-retrieve`) live in [`../hermes/`](../hermes/); this project
covers the engine itself. Newsrooms never touch any of this — they talk to
Aldus on Slack, and Aldus's profile enforces the scoping.

## Architecture in one paragraph

Headless RAGFlow v0.25.6 runs on `onyx01.wepublish.cloud` (Hetzner CPX41, 16 GB).
**Every port is bound to loopback** — nothing is reachable from the internet
(Docker bypasses `ufw`, so loopback binding is the actual security boundary,
not the firewall). Access is therefore SSH-gated: whoever holds an authorized
key for `root@onyx01` can reach the KB; nobody else can. Retrieval is hybrid
(vector + keyword) over `bge-m3` embeddings (multilingual — German/French
content works), served by a TEI sidecar. RAGFlow has **no chat LLM** — it only
retrieves; answer generation happens in Hermes (OpenRouter). Datasets
(namespaces): `public`, `internal`, `newsroom:{slug}`.

## Access model — read this before wiring anything

The RAGFlow API key is **tenant-wide**: it reads and writes *all* datasets,
including every `newsroom:*`. There is no per-dataset key. Consequences:

- SSH access to `onyx01` = full KB access. Treat key distribution as the
  access-control decision it is (IT/dev team only).
- Scoping is enforced one layer up: Hermes profiles get `RAGFLOW_ALLOWED_DATASET_IDS`
  allowlists and the `kb-ingest` / `kb-retrieve` scripts fail closed outside them.
- Never embed the API key in anything a newsroom or external party can reach.

## Option 1 — MCP (for AI coding agents)

RAGFlow's built-in MCP server runs on `onyx01` loopback `:9382`
(streamable HTTP, self-host mode — the server holds the API key, so the
tunnel *is* the auth). It exposes one tool: `ragflow_retrieval` (read-only).

```bash
# 1. open a tunnel (keep it running)
ssh -fN -L 9382:127.0.0.1:9382 root@onyx01.wepublish.cloud

# 2. point your MCP client at it — .mcp.json:
{
  "mcpServers": {
    "ragflow-kb": { "type": "http", "url": "http://127.0.0.1:9382/mcp" }
  }
}
```

Ingest and health are **not** MCP tools — use the HTTP API (option 2) or the
`wp-kb` CLI (option 3) for those.

## Option 2 — HTTP API (scripts, services)

The API key lives on the box at `/opt/ragflow-deploy/ragflow-api-key.txt`.
With a tunnel on `:9380` (same pattern as above):

```bash
KEY=$(ssh root@onyx01.wepublish.cloud cat /opt/ragflow-deploy/ragflow-api-key.txt)

# list datasets (names + ids + doc/chunk counts)
curl -s -H "Authorization: Bearer $KEY" "http://127.0.0.1:9380/api/v1/datasets?page_size=100"

# retrieve — NEVER pass keyword:true (no chat LLM is configured; it would error)
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"question": "How does peering auth work?", "dataset_ids": ["<id>"], "page_size": 8}' \
  http://127.0.0.1:9380/api/v1/retrieval
```

API shape (v0.25.6): everything under `/api/v1/...`. Ingest = upload
(`POST /api/v1/datasets/{id}/documents`, multipart) → metadata
(`PUT .../documents/{doc_id}`, `meta_fields`) → parse
(`POST .../chunks`, `{"document_ids": [...]}`). Prefer `tools/wp-kb` or the
`kb-ingest` script (`../hermes/skills/kb-ingest/`) over hand-rolling this —
they enforce the tagging schema.

## Option 3 — `wp-kb` CLI (ops + quick checks)

`tools/wp-kb` in this project runs everything over SSH (no tunnel needed):

```bash
tools/wp-kb health                      # containers + dataset doc/chunk counts + MCP probe
tools/wp-kb datasets                    # raw dataset JSON
tools/wp-kb query "peering auth" internal
tools/wp-kb ingest ./notes.md internal  # upload + parse (no schema tags — prefer kb-ingest)
tools/wp-kb tunnel                      # convenience: open the :9382 MCP tunnel
```

Override `HOST` / `SSH_KEY` env vars if your key isn't at the default path.

## Hermes side (already wired)

`hermes01` reaches the KB through `ragflow-tunnel.service` (systemd,
auto-restarting SSH tunnel with a **restricted** dedicated key — port-forward
only, no shell, locked to `127.0.0.1:9380/9382`). Profile env contract
(`profiles/<name>/.env`):

```
RAGFLOW_BASE_URL=http://127.0.0.1:9380
RAGFLOW_API_KEY=<from /opt/ragflow-deploy/ragflow-api-key.txt on onyx01>
RAGFLOW_ALLOWED_DATASET_IDS=<comma-separated ids this profile may touch>
# support profiles additionally force:
RAGFLOW_FORCE_SOURCE=newsroom-asserted
RAGFLOW_FORCE_CONFIDENCE=unverified
```

The `internal` profile has all three datasets; future `support-<slug>` profiles
get only `public` + their own `newsroom:<slug>` id.

## Operating the engine (runbook)

```bash
ssh root@onyx01.wepublish.cloud
cd /opt/ragflow/docker

# status / logs
docker compose ps
docker logs docker-ragflow-cpu-1 --tail 50
docker logs docker-tei-cpu-1 --tail 50

# restart — a bare up -d is correct: COMPOSE_FILE in .env carries the local
# override files (docker-compose-tei.yml, docker-compose-mcp.yml) automatically
docker compose up -d
```

- **Memory is managed and capped** (adversarially reviewed 2026-06-11): TEI 6g,
  RAGFlow 6g, ES 3g with a pinned 1g heap (`ES_JAVA_OPTS` in `.env`) and
  `memswap_limit` so ES never swaps. 3 GB swapfile as host-level insurance.
  Measured steady state: ~7.3 of 15.6 GiB. The dials: TEI flags in
  `docker-compose-tei.yml` (do NOT set `--max-client-batch-size` below 16 —
  RAGFlow sends embed batches of 16 — and keep the `tei-sentence-bert-config.json`
  mount: it clamps inputs to 2048 tokens, preventing a TEI queue livelock),
  `MEM_LIMIT` + `ES_JAVA_OPTS` in `.env`.
- **Watchdog**: root cron runs `/opt/ragflow-deploy/watchdog.py` every 5 min →
  atomic status JSON at `/opt/ragflow-deploy/health-status.json` (container
  states, OOM/restart deltas, disk, and a *digestion probe* — documents stuck
  in parsing, the failure liveness checks miss). `wp-kb health` displays it and
  flags staleness. A companion poller on hermes01 (`/opt/kb-watch/`) probes
  end-to-end through the tunnel and posts Slack alerts on state transitions
  once `SLACK_ALERT_CHANNEL` is set in `/opt/kb-watch/kb-watch.env`.
- **Backups**: nightly `mysqldump` cron → `/opt/ragflow-deploy/backups/`
  (14-day rotation). MySQL holds users/API keys/dataset configs — NOT
  re-derivable; chunks ARE (re-ingest from sources). Ship dumps off-box
  (Hetzner Storage Box) before relying on them for disaster recovery.
- **If memory pressure returns**: documented fallback is swapping the embedding
  model to `intfloat/multilingual-e5-base` (~1.5 GiB TEI at default flags) —
  declined for now because RAGFlow never sends the `query:`/`passage:` prefixes
  e5 expects, costing retrieval quality; bge-m3 is prefix-free. Cheap to revisit
  while datasets are small (recreate datasets + re-ingest).
- **Key rotation**: mint a new key via the API (`POST /api/v1/system/tokens`,
  session login required) or rerun the configure script; update
  `/opt/ragflow-deploy/ragflow-api-key.txt`, `docker-compose-mcp.yml`
  (`--mcp-host-api-key`), and every Hermes profile `.env`; restart.
- **Service secrets** (MySQL/MinIO/Redis): `/opt/ragflow-deploy/secrets.env` (root-only).
- **Scaling**: if real multi-newsroom ingest load arrives, resize to CPX51
  (32 GB) in the Hetzner console — no config change needed, the stack just
  gets headroom.
- Deploy scripts + full first-deploy notes ("v0.25.6 realities"): handed over
  separately with `wp-knowledge/` (Tom).

## Hard rules

1. Never expose any RAGFlow port beyond loopback. The tunnel is the front door.
2. Never pass `keyword:true` to `/retrieval`.
3. KB writes from agents go through `kb-ingest` (schema enforced, fails closed);
   `confidence=confirmed` requires a named human reviewer.
4. The MCP server is retrieval-only by design — don't look for write tools.
