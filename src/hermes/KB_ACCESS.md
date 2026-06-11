# Knowledge base access — RAGFlow on `onyx01`

For We.Publish developers and IT. How to query, ingest into, and operate the
knowledge engine. Newsrooms never touch any of this — they talk to Aldus on
Slack, and Aldus's profile enforces the scoping.

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
`kb-ingest` script over hand-rolling this — they enforce the tagging schema.

## Option 3 — `wp-kb` CLI (ops + quick checks)

`tools/wp-kb` in this directory runs everything over SSH (no tunnel needed):

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

# restart — ALWAYS pass every -f file; compose recreates services without
# overrides that are omitted (TEI would come back with OOM-ing defaults):
docker compose -f docker-compose.yml -f docker-compose-tei.yml \
  -f docker-compose-mcp.yml --env-file .env up -d
```

- **Memory is the scarce resource** (TEI + Elasticsearch + RAGFlow ≈ the whole
  box). TEI batch caps live in `docker-compose-tei.yml`; the ES limit is
  `MEM_LIMIT` in `.env`. If the kernel OOM-kills things after a config change,
  those two are the dials.
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
