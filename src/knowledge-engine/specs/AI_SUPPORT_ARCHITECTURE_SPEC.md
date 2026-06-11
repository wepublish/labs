# We.Publish Knowledge & Support Architecture — Current State

Status: authoritative parent spec
Updated: 2026-06-10

This is the single source of truth for the architecture, build order, and infrastructure. The other specs detail individual layers and must not duplicate the infra/cost/SSH content here.

> **Update (2026-06-11):** "Hermes" = the **NousResearch `hermes-agent` runtime** (OD2 resolved — see `REMAINING_WORK.md`). **Routing (revised same day): one Slack app ⇒ one gateway ⇒ the `internal` profile (Aldus) serves ALL Slack channels** — Socket Mode load-balances events across connections, so per-newsroom profiles don't work with a single app (and multiple apps are ruled out). Newsroom isolation boundary = channel→dataset map enforced in the skills (`RAGFLOW_CHANNEL_MAP`) + trusted channel-ID env injection (upstream hermes-agent contribution, prerequisite for the first newsroom channel) + memory restrictions + isolation probes. **Tracker = GitHub Issues phase 1** (reads of "Jira/Linear" below mean "the tracker; currently GitHub Issues"). Developer MCP access to the KB deferred. KB writes only via the hardened `kb-ingest` skill. Configs + skills: `labs/src/hermes/`.

## Goal

One central, updated, structured knowledge base + support runtime serving:

- **Newsrooms** — onboarding and support, via Hermes.
- **Developers** — code/tickets/docs context, via MCP or Hermes.
- **A routing loop** — newsroom request → Linear ticket → developer.

## Core decisions

1. **Engine: RAGFlow** (self-hosted, Apache-2.0 fully-open, headless `/retrieval` hybrid, DeepDoc parsing, MCP server). Chosen via a local+cloud bake-off vs Onyx CE — see `BAKEOFF_RESULTS.md`. Embeddings: **`bge-m3`** (multilingual, for the German docs).
2. **LLM: OpenRouter** (external API, phase 1), default `anthropic/claude-haiku-4.5` (configurable). Drives Hermes triage/generation. Key in gitignored `openrouter.txt` → env `OPENROUTER_API_KEY`. No self-hosted inference until cost/latency/privacy justifies it.
3. **Headless engine.** No end user logs into RAGFlow's UI. It is a retrieval/ingestion backend behind Hermes.
4. **Hermes is the architecture** — gateway, tenant policy-enforcement point, ingestion pipeline, support-triage, ticket router, human-gate enforcer. The engine is swappable beneath it (Onyx is the documented fallback).
5. **Two trust tiers only.** Internal (developers/staff) see everything internal. Newsrooms are Hermes-mediated and never authenticate to the engine. Hermes scopes every query to a namespace, so per-user RBAC is never required.
6. **Knowledge = schema-on-ingest via Hermes, not a hand-maintained git vault.** Structure comes from ingestion-time tagging. Sources are routed by type (see below), not dumped raw.
7. **Tenant operational data → CMS via CMS MCP, never in the index.** The KB stores only reviewed summaries.

## System roles

| Component | Role |
|---|---|
| **RAGFlow** | headless hybrid retrieval (`/retrieval`) + ingestion API + MCP search over `public` / `internal` / `newsroom:{slug}` datasets |
| **Hermes** (on Slack, LLM = OpenRouter) | the only thing users touch; classifies, scopes to a namespace, **owns all ingestion (by source type)**, drafts answers/tickets, calls CMS MCP, enforces human gates |
| **CMS MCP** | live We.Publish CMS diagnostics (read-only first, gated writes later). The real engineering project. |
| **Developer Context MCP** | **live GitHub code/file lookup at HEAD** — code is never embedded into the KB |
| **Jira (now) / Linear (later)** | tracked work + support→developer routing; ingested as reviewed summaries by Hermes |
| **Slack** | conversation + Hermes's home surface (summary-first ingest), not durable truth |
| **llms.txt / llms-full.txt** | public agent context, indexed into the `public` namespace |

## Boundary rules

| Surface | Rule |
|---|---|
| Newsroom (via Hermes) | public docs + that newsroom's namespace only. CMS MCP read-only. No other newsroom, no internal sources. |
| Developer (via MCP/Hermes) | public + internal namespaces, Developer Context MCP, Linear/GitHub. |
| Engine | headless. No direct end-user login. Hermes holds the only scoped credentials. |
| CMS MCP | live CMS state/actions only. Curated tools. No arbitrary GraphQL. Read-only until gated writes are built. |
| Sensitive data | payments/accounts/credentials/member data never enter the index; they live in the CMS. |
| Approvals | no PR merges by agents; no CMS writes without dry-run + human approval + audit. |

## Source routing

Hermes owns ingestion and routes each source by what it actually needs (detail: `KNOWLEDGE_BASE_SPEC.md`):

| Source | Handling |
|---|---|
| **Code (GitHub repos)** | live MCP at HEAD — **never embedded** |
| **Issues/tickets (Jira → Linear)** | Hermes ingests reviewed summaries / live-query; swapping Jira→Linear = swap Hermes adapter |
| **Docs (GitBook, repo markdown, site)** | small scheduled scrape → `public`/`internal` |
| **Slack** | Hermes ingests reviewed summaries (it lives on Slack) |
| **Newsroom knowledge** | Hermes conversational ingest + uploads (`newsroom-asserted`/`unverified`) |
| **Live CMS state** | not indexed — CMS MCP reports on demand |

RAGFlow has no turnkey connectors; that's fine — the only real ingestion we build is a small doc-scrape job, and everything else is Hermes-owned anyway (which keeps the engine swappable).

## Build order

1. **Deploy RAGFlow** headless on the engine host (hardened compose baking in the boot fixes — see `BAKEOFF_RESULTS.md`): three datasets (`public`/`internal`/`newsroom:{slug}`), `bge-m3` embeddings, MCP enabled, backups.
2. **CMS MCP read-only** — start *in parallel*; it is the longest-lead, highest-value build.
3. **Hermes on `hermes01`** — install the hermes-agent runtime; `internal` profile (Aldus) serves all Slack channels (OpenRouter LLM, `kb-retrieve`/`kb-ingest` skills, CMS MCP, GitHub Issue routing). Per pilot newsroom: dedicated channel + `RAGFLOW_CHANNEL_MAP` entry + dataset + isolation probes — no new profile/gateway.
4. **Doc-scrape ingestion** (GitBook/site/repo markdown → `public`/`internal`) + **Developer Context MCP** (live GitHub).
5. **Newsroom onboarding ingest** (conversational) + first pilot media in its own namespace.
6. **Public docs namespace** + `llms.txt` published and indexed.
7. **Later** — gated CMS write tools after read-only is stable.

## Infrastructure (single source — do not duplicate elsewhere)

Two Hetzner VPS (hostnames are just names — `onyx01` runs RAGFlow):

| Host | Target class | Runs |
|---|---|---|
| `onyx01.wepublish.cloud` | **CPX41 (8 vCPU / 16 GB / 240 GB)** — RAGFlow's documented minimum (CPX51/32 GB only if heavy ingestion is expected) | RAGFlow (ES/Infinity + MySQL + MinIO + Redis + server; ~16 GB) |
| `hermes01.wepublish.cloud` | CPX31 (4 vCPU / 8 GB / 160 GB) | Hermes gateway + Slack + CMS MCP + Developer Context MCP; private access to RAGFlow |

- **As provisioned today both are ~2 vCPU / 3.7 GB** (verified by SSH 2026-06-10; Docker not yet installed) — too small for RAGFlow. `onyx01` must be resized to **≥16 GB (CPX41)** before the production deploy. **The deploy script fails closed below 15 GB.**
- **Why 16 GB even with an external LLM:** OpenRouter offloads only the *chat/generation* model. RAGFlow's RAM is consumed locally by **Elasticsearch** (the floor — OOM-crashes, not "runs slow", below its heap), the **`bge-m3` embedding model** (~2.3 GB, run on the host for every ingest *and* query — OpenRouter does not do embeddings), DeepDoc parsing models, plus MySQL/MinIO/Redis. 3.7 GB cannot boot it; this is empirically what OOM-killed ES in the bake-off. To attempt 8 GB (CPX31) you must additionally offload embeddings to an external API + use the Infinity engine + naive chunking — risky under load.
- **LLM:** OpenRouter (external, chat only). **Embeddings:** `bge-m3` local on the engine host (RAM driver; can move to an external embeddings API to shrink the box). No self-hosted chat inference in phase 1.
- **Split rationale:** keep RAGFlow's blast radius separate from the tool-using agent + live CMS operations.

### SSH

Key pair found and verified on the laptop:

- private: `~/.ssh/wepublish_hetzner_ed25519` (perms 600)
- public: `~/.ssh/wepublish_hetzner_ed25519.pub`
- fingerprint: `SHA256:g8sUZ/tT3mH+wY3bFaPAs0CB7t+JAv9hbGKAKvZ6aqI` (`tomvaillant@wepublish-hetzner`)

Install the public key on both hosts. Never paste the private key. Connect: `ssh -i ~/.ssh/wepublish_hetzner_ed25519 root@<host>`.

### Cost (infrastructure only)

| Item | ~EUR/month |
|---|---:|
| `onyx01` (CPX41, 16 GB) | ~30 (CPX51/32 GB ~65 if needed) |
| `hermes01` (CPX31) | 12–22 |
| Backups / snapshots / off-server storage | 18–40 |
| **Total infra** | **~110–140** |
| Engine license | **0** (RAGFlow is Apache-2.0) |
| OpenRouter LLM | usage-based, tracked separately (bake-off cost was ~cents) |

### Backups

Server snapshots + off-server copies (Hetzner Storage Box / Object Storage) of the index, database, and config. Test a restore before any pilot goes live.

## Open decisions

- Resize `onyx01` → **CPX41 (16 GB)** (required before the RAGFlow deploy; CMS MCP validation does not need it). Deferred by Tom (2026-06-10) — script stays gated.
- ~~OpenRouter model choice for production~~ — resolved 2026-06-11: **`anthropic/claude-sonnet-4.6`** for the internal (Aldus) profile, deployed on hermes01. Support profiles: revisit cost/quality at pilot (template still haiku-4.5).
- First pilot newsroom.
- ~~Jira→Linear migration timing~~ — superseded 2026-06-11: phase-1 tracker = GitHub Issues; revisit Jira/Linear later via the swappable routing skill.
- Whether the doc-scrape + Developer Context MCP merge into one ingestion service.
