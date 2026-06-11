# We.Publish Knowledge / Support Architecture — specs

> Status (2026-06-11): **decided AND deployed.** RAGFlow live on `onyx01`, Hermes (Aldus)
> live on `hermes01`, wire + skills validated end-to-end. Operational docs:
> [`../README.md`](../README.md); deploy scripts: [`../deploy/`](../deploy/); setup
> action log: [`../kb-setup-log.json`](../kb-setup-log.json). These specs are the
> decision record (formerly the laptop-local `wp-knowledge/`, migrated here for handover).

> Status (2026-06-10): **decided.** Engine = **RAGFlow** (Apache-2.0, self-hosted, headless). LLM = **OpenRouter** (`anthropic/claude-haiku-4.5` default). Bake-off evidence in `BAKEOFF_RESULTS.md`. `AI_SUPPORT_ARCHITECTURE_SPEC.md` is authoritative.
>
> **Update (2026-06-11):** Hermes = the **NousResearch `hermes-agent` runtime**. **Routing (revised same day): one Slack app ⇒ one gateway ⇒ the `internal` profile (Aldus) serves ALL channels** — per-newsroom profiles superseded; newsroom isolation = channel→dataset map in the skills + trusted channel-ID env injection (upstream hermes-agent contribution) + memory restrictions + isolation probes. Configs + hardened skills: `labs/src/hermes/`. **Phase-1 tracker = GitHub Issues** (Jira/Linear deferred). Developer MCP access to the KB: deferred. Ingest = chat-driven via the `kb-ingest` skill, IT-owned.

## The project in brief

One central, **updated, structured knowledge base** serving two audiences, plus a routing loop between them:

- **Newsrooms** — onboarding & support. They talk to **Aldus in their dedicated Slack channel** (one gateway, channel→dataset scoping), never to the engine directly (no RAGFlow login, MCP, or API in any form). Hermes writes their setup/account data to the CMS for them and answers from their own knowledge namespace.
- **Developers** — code, tickets, docs. Phase 1: via the internal Hermes profile on Slack (direct KB-MCP access from coding agents is deferred).
- A newsroom support request becomes a **tracked ticket (GitHub Issues, phase 1) routed to a developer**.

### Architecture in one picture

```text
Newsroom A ──► #support-a (Slack) ─┐  ONE gateway, internal profile (Aldus);
Newsroom B ──► #support-b (Slack) ─┼─► scoped skills (channel→dataset map) ─► RAGFlow
Staff/devs ──► #dev-aldus (Slack) ─┘     (headless: /api/v1/retrieval — public / internal / newsroom:{slug})
Hermes also ──► CMS MCP (live tenant state, read-only → gated writes)
           ──► Developer Context MCP (live GitHub at HEAD — code never embedded)
           ──► GitHub Issues (tracked work, support→dev routing; tracker swappable)
KB writes  ──► kb-ingest skill only (hardened: dataset allowlist, forced tags, fail-closed)
```

### Decisions locked

- **Engine: RAGFlow** — self-hosted, fully-open (Apache-2.0), headless `/retrieval` hybrid + MCP. Chosen over Onyx CE (tied on quality; won on open license + clean headless retrieval).
- **LLM: OpenRouter** (external, phase 1); embeddings `bge-m3` (multilingual).
- **Hermes is the architecture** — gateway, tenant-scoper, **ingestion owner**, router. Engine swappable beneath it (Onyx = fallback).
- **Two trust tiers** (internal sees everything; newsrooms Hermes-mediated). No per-user RBAC needed.
- **Knowledge = schema-on-ingest, routed by source type** (code→live MCP; issues→summaries; docs→scrape; Slack→Hermes) — not a git vault, not raw dumps.
- **Tenant operational data → CMS via CMS MCP — never in the index.**

### Ruled out (and why)

| Option | Why not |
|---|---|
| Onyx CE | tied on quality, but open-core + its hybrid retrieval won't run headless |
| Onyx Cloud / EE, Neon, any managed/paid tier | external cost dependency |
| Raw pgvector / self-built on Supabase | makes *us* the RAG maintainer |
| Open WebUI / AnythingLLM | weak retrieval backbone for headless use |
| R2R | weakest maintainer-health signal |

## Reading order

1. `AI_SUPPORT_ARCHITECTURE_SPEC.md` — **authoritative**: decisions, source routing, build order, infra (single source for topology/SSH/cost).
2. `KNOWLEDGE_BASE_SPEC.md` — RAGFlow KB design: namespaces, schema-on-ingest, source routing, retrieval contract.
3. `HERMES_SUPPORT_CHAT_SPEC.md` — Hermes as gateway/scoper/ingest/triage/router (on Slack, OpenRouter).
4. `MCP_DELIVERY_SPEC.md` — RAGFlow MCP, CMS MCP (the real build), Developer Context MCP (live GitHub).
5. `LLMS_PUBLIC_CONTEXT_SPEC.md` — public `llms.txt` context files.
6. `AI_STRATEGY.md` — leadership-facing strategy.
7. `BAKEOFF_RESULTS.md` — RAGFlow vs Onyx head-to-head (full numbers + rationale).
8. `ENGINE_EVALUATION.md` / `AI_STRATEGY_DELIVERY_AUDIT.md` — bake-off method + decision log (provenance).

Secrets are never in this repo — they live in `chmod 600` files on the two VPS
(see `../README.md` for locations).
