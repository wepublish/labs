# Engine Bake-off: RAGFlow vs Onyx CE

Status: **DECIDED (2026-06-10) — RAGFlow.** Full numbers + rationale in `BAKEOFF_RESULTS.md`.
Updated: 2026-06-10

> Outcome (local + cloud): under the production-representative cloud LLM (claude-haiku-4.5) quality was **effectively tied** — RAGFlow 96.7% / Onyx 93.3% overall but identical 95.5% positive correctness, both 100% retrieval-hit, both clean isolation (Onyx's 1 flag = the X2 test artifact). Quality did NOT decide it. **RAGFlow won on (1) fully-open Apache vs Onyx open-core and (2) clean headless `/retrieval`** — Onyx's hybrid retrieval would not run headless even with the cloud model (agent emits add_memory as text, ignores allowed_tool_ids), so its leg used keyword+full-content. Confidence: **high.** Onyx = fallback. Details: `BAKEOFF_RESULTS.md`.

## What we're choosing

The headless RAG engine that sits behind Hermes (see `AI_SUPPORT_ARCHITECTURE_SPEC.md`). It must be **self-hosted, fully-open, free-multi-tenant, headless-capable**, and actively maintained so we ride upstream updates. Two finalists survived elimination:

| | RAGFlow | Onyx CE |
|---|---|---|
| License | Apache 2.0, **fully open** | MIT but **open-core** (RBAC/SSO/permission-sync are EE) |
| Multi-tenancy (free) | teams / knowledge bases | document-set **filter** works in CE; per-user RBAC is EE |
| Maintainer momentum | GitHub fastest-growing RAG engine | YC-funded, active |
| "Updates flow to the open build" | yes | partial — governance features go to EE |
| MCP | native MCP server | native MCP server |
| Ingestion API | REST | ingestion API |
| Connectors (dev docs auto-sync) | weaker — wire via API/MCP | **40+ auto-sync** |
| Standout | DeepDoc deep-document parsing | connector breadth + polish |
| Footprint | ES/Infinity + MySQL + MinIO + Redis (~16 GB) | Postgres + OpenSearch + Redis + workers (~16 GB) |

Both fit `onyx01` once resized to ≥16 GB (CPX41; CPX51 only if heavy ingestion). The genuine trade is **fully-open + best parsing (RAGFlow)** vs **turnkey connectors but open-core (Onyx CE)**. Current lean: RAGFlow, on the "ride the open updates / no paywall gradient" criterion — but decide on evidence below.

## Eval corpus

Index the **same** three-namespace corpus in both engines:

- `public` — We.Publish public docs (docs.wepublish.ch), a few wepublish.ch pages, draft `llms.txt`.
- `internal` — a slice of developer docs (GitBook/GitHub-docs) + 5–10 reviewed support patterns.
- `newsroom:pilot` — one real newsroom pack: design rules, audience, CMS use, integrations (mix of clean text + a messy PDF/brand guide to test parsing).

## Scorecard

Score each 1–5; weight in parentheses.

| Criterion | Weight | What to measure |
|---|---|---|
| Retrieval quality | ×3 | answer correctness + citation accuracy on the eval set (below) |
| Ingestion quality | ×3 | how cleanly the messy PDF/brand guide is parsed and chunked |
| Multi-tenant isolation | ×3 | `newsroom:pilot` content never returned on a `public`/`internal` query, and vice-versa, when Hermes scopes by namespace |
| Ingestion ergonomics | ×2 | lines of glue to push a structured chunk + tags via API |
| MCP / dev access | ×2 | can a coding agent query a namespace via the engine's MCP with a scoped token |
| Connector lift | ×2 | effort to keep `internal` dev docs fresh (auto-sync vs scripted) |
| Ops weight | ×1 | containers, RAM at idle/load, upgrade friction |
| Maintainer health | ×1 | release cadence, open-core gradient risk |

## Eval question set (build 20–30)

Cover all four answer classes per `KNOWLEDGE_BASE_SPEC.md` (`confirmed` / `likely` / `unverified` / `not_found`):

- **Public** (≈8): general CMS/editor/publisher questions answerable from public docs.
- **Internal** (≈6): support-pattern and architecture questions answerable from internal sources.
- **Newsroom-scoped** (≈8): questions about `newsroom:pilot`'s design/audience/integrations — must answer from that namespace only.
- **Isolation probes** (≈4): ask, while scoped to `public`, for something only in `newsroom:pilot` (and vice-versa). **Correct answer = "not found" / refusal.** Any leak = automatic fail on the isolation criterion regardless of other scores.
- **Not-found** (≈4): plausible but unsupported — must escalate, not hallucinate.

## Deploy steps (on `onyx01`)

1. Bring up both stacks via Docker Compose (separate ports/volumes), external LLM + embedding keys.
2. Create the three namespaces in each (RAGFlow knowledge bases / Onyx CE document sets).
3. Ingest the eval corpus identically.
4. Drive both through a scoped API/MCP token (simulating Hermes), not the web UI.
5. Run the question set; record scores + notes + glue-code line counts.
6. Tear down the loser; keep the winner as the pilot engine.

## Decision rule

- **Hard gate:** any isolation-probe leak disqualifies an engine for this design.
- Among engines that pass the gate, pick the higher weighted score.
- If within ~10%, break the tie toward **RAGFlow** (fully-open, no open-core gradient) unless Onyx's auto-sync connectors demonstrably save material ongoing effort on the `internal` namespace.

## Don't re-decide downstream

Whatever wins, **Hermes owns ingestion, scoping, and routing** — so the engine stays swappable. Do not let engine-specific features leak into Hermes's contract beyond "ingest to namespace" and "search namespace."
