# Decision Log

Status: provenance — why the architecture landed where it did
Updated: 2026-06-10

> The live engine decision is in `ENGINE_EVALUATION.md`. Infra/cost is in `AI_SUPPORT_ARCHITECTURE_SPEC.md`. This file records *why* we eliminated options, so the choices aren't relitigated.

## How the architecture converged

1. **Started Onyx-centric.** Original plan: Onyx as the central knowledge + chat + connector + MCP runtime, with a git-markdown vault as authored truth and authenticated Onyx chat as the client front door.
2. **Hit the open-core wall.** Onyx's multi-tenant isolation (document RBAC, SSO, permission-sync) is Enterprise-only — even self-hosted. The whole "media A can't see media B" security model depended on a paid tier.
3. **Resolved it with Hermes-mediation.** Because there are only **two trust tiers** (internal; newsrooms) and newsrooms never log into the engine, **Hermes** can enforce isolation by scoping queries. The engine's paid RBAC is never needed. This also made the engine **headless** and **swappable**.
4. **Rejected the git vault.** Hand-authored markdown across teams + many newsrooms is unmaintainable; newsrooms want Hermes to ingest their knowledge conversationally. Replaced with **schema-on-ingest**.
5. **Tested "lighter / managed / cheaper" and rejected it.** Neon and any managed tier add an external cost dependency; raw pgvector/Supabase-from-scratch make *us* the RAG maintainer. The real preference is: **self-host a fully-open engine and ride upstream updates**.
6. **Narrowed to two finalists** for a bake-off: **RAGFlow** and **Onyx CE**.
7. **Ran the bake-off (local + cloud LLM). Decided: RAGFlow.** Quality tied under a cloud model (both ~95.5% positive, 100% hit, clean isolation); RAGFlow won on fully-open license + clean headless `/retrieval` (Onyx's hybrid retrieval wouldn't run headless). Full numbers: `BAKEOFF_RESULTS.md`.
8. **Locked the operating shape:** Hermes on Slack (OpenRouter LLM); source routing by type (code→live GitHub MCP, issues→summaries, docs→scrape, Slack→Hermes); `bge-m3` embeddings.

## Option elimination

| Option | Verdict | Why |
|---|---|---|
| Git-markdown only | authored layer at most, not runtime | no hybrid search/permissions; unmaintainable across newsrooms |
| Onyx Cloud / EE | reject | paid; we won't buy a tier |
| Neon / managed Postgres | reject | external paid dependency |
| Supabase self-host / raw pgvector | reject | we'd own all RAG plumbing (bespoke) |
| Open WebUI / AnythingLLM | reject | weak connectors, chat-first, not a headless KB backbone |
| Kapa / Ragie / Vectara | reject | managed/paid; KB lives in a vendor |
| R2R | reject (for now) | cleanest headless fit but weakest maintainer-health signal |
| **RAGFlow** | **finalist** | Apache 2.0 fully-open, free multi-tenancy, fastest-growing, DeepDoc parsing, native MCP |
| **Onyx CE** | **finalist** | MIT, best auto-sync connectors + MCP; doc-set scoping works headless (open-core is the caveat) |

## What not to build

- A custom RAG platform before trying the open engines.
- A git-only customer-facing support bot.
- A generic GraphQL MCP for newsroom support.
- Separate bots for docs/Slack/Linear/onboarding.
- Public chat with access to internal/newsroom namespaces.

## Standing risks + mitigations

- **Scoping is the main risk.** A Hermes scoping bug leaks one namespace into another. Mitigation: isolation probes in the eval (hard gate), hostile-prompt testing, scoped tokens only.
- **Answer quality depends on source quality.** Mitigation: weekly no-answer review, `confirmed`/`last_updated` tagging, stale reports.
- **CMS writes are dangerous.** Mitigation: read-only first, dry-run, approval, audit, narrow schemas, no arbitrary GraphQL.
- **Newsroom-asserted garbage-in.** Mitigation: tag `unverified`, keep separate from We.Publish-verified, never auto-promote.
- **Open-core drift (if Onyx wins).** Mitigation: rely only on CE features; keep the engine swappable behind Hermes.

## Final recommendation

Adopt **RAGFlow** (self-hosted, Apache-2.0) as the headless knowledge runtime, with **Hermes** (on Slack, OpenRouter LLM) as gateway/scoper/ingestion/router. Build the **CMS MCP** because live tenant state is required for real support/onboarding. Keep the Developer Context MCP internal and live (GitHub at HEAD; code never embedded). Publish `llms.txt`. Confidence: high — decided on a measured local+cloud bake-off, not in the abstract.
