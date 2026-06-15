# AGENTS.md — knowledge-engine project map

Orientation for AI agents (and humans) working on the We.Publish knowledge base.
Read this before touching anything KB-related.

## What this project is

The operational home of the We.Publish knowledge engine: RAGFlow v0.25.6 running
headless on `onyx01.wepublish.cloud`, queried by the Hermes agent (Aldus) on
`hermes01.wepublish.cloud` and by IT/dev tooling. Datasets (namespaces):
`public`, `internal`, `newsroom:{slug}` — embeddings `bge-m3` via TEI sidecar.

## Directory map

| Path | What |
|---|---|
| `README.md` | **Start here** — access paths (MCP / HTTP API / wp-kb), access model, ops runbook |
| `AGENTS.md` | this file |
| `TODO.md` | live operational checklist (what remains; updated as work lands) |
| `kb-setup-log.json` | machine-readable log of every core action that built the KB (2026-06-11) |
| `deploy/` | deploy scripts: `deploy.sh` (laptop orchestrator) → `provision-onyx01.sh` + `configure-ragflow.py` + `watchdog.py`; `hermes-poller/` (monitoring on hermes01); `deploy/README.md` has the v0.25.6 gotchas ("realities") |
| `specs/` | decision record: architecture, KB design, Hermes spec, MCP delivery, bake-off evidence, strategy docs, plans |
| `tools/wp-kb` | ops CLI — `wp-kb health\|datasets\|query\|ingest\|tunnel` (runs over SSH) |

## Related projects in this repo

| Path | What |
|---|---|
| `../hermes/` | Hermes/Aldus configuration: profiles (SOUL.md), skills (`kb-ingest`, `kb-retrieve`), `slack/` (app manifest) |
| `handover.html` | the handover artifact (whole AI stack) — deployed at `/labs/knowledge-engine/handover.html` |
| `../../wepublish-cms-mcp/` | CMS MCP (read-only admin diagnostics over the We.Publish GraphQL API) |

## The two boxes

| Host | Runs | Access |
|---|---|---|
| `onyx01.wepublish.cloud` | RAGFlow stack (docker compose in `/opt/ragflow/docker`), watchdog + backups in `/opt/ragflow-deploy/` | SSH key only — **everything is loopback-bound**; SSH = the security boundary |
| `hermes01.wepublish.cloud` | Hermes (Aldus) + Slack gateway, `ragflow-tunnel.service`, `kb-watch` poller (`/opt/kb-watch/`) | SSH key only |

## Hard rules for agents

1. **Never commit secrets.** No API keys, passwords, tokens — run
   `git check-ignore -v` on anything doubtful. Secrets live in `chmod 600` files
   on the boxes; a zip of the RAGFlow credentials is transferred out-of-band.
2. **KB writes go through `kb-ingest`** (schema enforced, fails closed);
   reads through `kb-retrieve` or `/api/v1/retrieval` — never `keyword:true`.
3. **Compose on onyx01**: bare `docker compose up -d` is correct (`COMPOSE_FILE`
   in `.env`). Do not remove the TEI config clamp or set `--max-client-batch-size`
   below 16 — `deploy/README.md` explains why.
4. **Newsrooms never touch RAGFlow** in any form. Channel-level scoping is the
   isolation model (see `TODO.md` prerequisites before any newsroom goes live).
5. Update `TODO.md` and `kb-setup-log.json` when you complete or add operational work.
