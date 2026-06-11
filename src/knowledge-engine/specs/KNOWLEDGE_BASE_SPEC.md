# Knowledge Base Spec

Status: decided
Updated: 2026-06-10

> Engine: **RAGFlow** (chosen via bake-off — see `BAKEOFF_RESULTS.md` / `ENGINE_EVALUATION.md`). Infra/hosting/cost live in `AI_SUPPORT_ARCHITECTURE_SPEC.md`.
>
> **Update (2026-06-11):** all KB writes go through the hardened **`kb-ingest` skill** (`labs/src/hermes/skills/kb-ingest/` — deterministic script: dataset allowlist, required tags, forced `newsroom-asserted`/`unverified` in support profiles, `confirmed` requires `--reviewed-by`). Ingest is chat-driven and IT-owned; the doc-scrape cron comes later. Issues/tickets: phase-1 tracker = **GitHub Issues** (read "Jira/Linear" below accordingly).

## Decision

The knowledge base is **RAGFlow** running headless behind Hermes: a self-hosted, fully-open (Apache-2.0) RAG engine providing hybrid retrieval (`/retrieval`), an ingestion API, and an MCP server. Hermes is the only client; it scopes every query to a namespace. Embeddings use **`bge-m3`** (multilingual — required for the German publisher docs). Generation/triage uses **OpenRouter** (external LLM, phase 1; key in gitignored `openrouter.txt`).

Knowledge enters by **schema-on-ingest via Hermes**, not a hand-maintained git vault. Structure comes from ingestion-time tagging, not folder discipline.

## Source routing (the core model)

Do **not** dump every source raw into the index. Route each by what it actually needs:

| Source | Handling | Why |
|---|---|---|
| **Code (GitHub repos)** | **Raw code: live MCP at HEAD — never embedded.** Derived **prose** about code (API domain references, newsroom implementation profiles) MAY be embedded — see "Derived code knowledge" below | code embeddings go stale fast; code-RAG is weak. Use Developer Context MCP for live lookup. Derived prose carries provenance that makes staleness detectable. |
| **Issues / tickets (Jira now → Linear later)** | Hermes ingests **reviewed summaries** (resolved → support-pattern), or live-query at answer time | raw ticket dumps make a noisy KB; switching Jira→Linear = swap Hermes's adapter, engine untouched |
| **Docs (GitBook, repo markdown, wepublish.ch)** | small scheduled **scrape → ingest** into `public`/`internal` | stable; auto-refresh via a cron-style Hermes job (RAGFlow has no turnkey connector — this is the only real ingestion we build, and it's tiny) |
| **Slack** | Hermes **lives on Slack** → ingests reviewed summaries | Hermes is the Slack app; summary-first, not raw |
| **Newsroom knowledge** | Hermes **conversational ingest + uploads** | design rules, audiences, integrations; tagged `newsroom-asserted`/`unverified` |
| **Live CMS state** | **not indexed** — CMS MCP read tools generate reports on demand | secrets/tenant data never enter the index |

This keeps Hermes the single ingestion owner and the engine swappable.

## Namespaces

| Namespace | Holds | Filled by | Visible to |
|---|---|---|---|
| `public` | public docs, site pages, `llms.txt` | scheduled doc scrape | everyone |
| `internal` | dev docs, architecture, reviewed support patterns, decisions, issue summaries | doc scrape + Hermes ingest | internal (devs/staff) |
| `newsroom:{slug}` | that newsroom's design/audience/CMS-use/integrations/history | Hermes conversational ingest + uploads | that newsroom (via Hermes) + internal |

Isolation is enforced by **Hermes scoping each query to a namespace** (RAGFlow dataset per namespace + `dataset_ids` filter) — not by per-user RBAC (not needed; two trust tiers).

## Schema-on-ingest

Every chunk carries: `namespace`, `type` (`doc`/`support_pattern`/`decision`/`media_profile`/`setup_summary`/`architecture`/`issue_summary`/`api_reference`/`implementation_profile`), `newsroom` (when applicable), `source` (URL/system/`newsroom-asserted`), `confidence` (`confirmed`/`likely`/`unverified`), `owner`, `last_updated`, and — for derived code knowledge — `repo_path` + `commit`.

### Derived code knowledge (amendment, 2026-06-11)

*Raw source code, GraphQL SDL, and Prisma schema are never embedded* (unchanged).
**Derived prose about code MAY be embedded** when every chunk carries: `source`
(GitHub URL), `commit` (short SHA it was derived from), `confidence: likely`
(machine-generated — never `confirmed` without human review), and an entry in the
ingest refresh manifest (`src/knowledge-engine/ingest/manifest.yaml`). Two types use
this: `api_reference` (per-domain API prose) and `implementation_profile`
(per-newsroom CMS implementation summaries). This extends the existing
"issues → reviewed summaries" pattern; provenance makes staleness detectable, the
manifest makes refresh mechanical. Rationale + decision: plans/2026-06-11-001 (KTD2).

### Garbage-in rule (required)
Newsroom-asserted knowledge is tagged `source: newsroom-asserted, confidence: unverified` and kept categorically separate from We.Publish-verified knowledge. Hermes must distinguish "you told us X" from "We.Publish confirms X" in every answer. Never auto-promote to `confirmed` without human review.

## Runtime retrieval contract

Every Hermes answer includes: citations (or explicit "not found in the knowledge base"); confidence (`confirmed`/`likely`/`unverified`/`not_found`); whether live CMS state was checked; provenance (We.Publish-verified vs newsroom-asserted); next step if incomplete. No source, no confident answer.

## Maintenance

- **Weekly:** review failed/escalated questions; convert resolved cases to support patterns; refresh doc scrape; flag stale chunks (`last_updated`).
- **Monthly:** review namespace scoping; refresh `llms.txt`; audit newsroom namespaces; dedupe patterns; review top no-answer queries.
- **Quarterly:** scoping audit; stale public-docs audit; RAGFlow upgrade review; backup restore drill.

## Acceptance criteria (pilot)

- RAGFlow running headless on the engine host with the three namespaces (one dataset each, `bge-m3` embeddings).
- ≥30 eval questions tested; ≥90% of answerable public questions return citations.
- Unsupported questions escalate, not hallucinate.
- Isolation probes pass (newsroom A unreachable from `public`/other scopes).
- Hermes queries RAGFlow via `/retrieval` and MCP with scoped dataset filters.
- Weekly maintenance owner + process exist.

## Bake-off provenance

RAGFlow vs Onyx CE were tested head-to-head (local + cloud LLM). Quality was effectively tied under a cloud model (both ~95.5% positive correctness, 100% retrieval-hit, clean isolation). RAGFlow won on **fully-open license** + **clean headless `/retrieval`** (Onyx's hybrid retrieval would not run headless). Full detail: `BAKEOFF_RESULTS.md`.
