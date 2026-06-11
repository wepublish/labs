# We.Publish AI Strategy

Leadership strategy for an AI-supported operating model.
Updated: 2026-06-11. Detailed design lives in the sibling specs; `AI_SUPPORT_ARCHITECTURE_SPEC.md` is authoritative.

> **Update (2026-06-11):** Hermes is implemented on the open-source `hermes-agent` runtime — **a single gateway/profile (Aldus) serving all Slack channels** (one Slack app permits only one event consumer; per-newsroom profiles were considered and superseded). Newsroom isolation is enforced per channel: code-level dataset maps in the retrieval/ingest skills, trusted channel identity (upstream runtime contribution), memory restrictions, and isolation probes before any newsroom channel goes live. Phase-1 tracker = **GitHub Issues** (Jira/Linear references below = "the tracker"). KB ingest is chat-driven by IT through a hardened skill; developer MCP access to the KB is deferred.

## Executive summary

Treat AI as operating infrastructure, not a single chatbot. Make organizational knowledge, support, onboarding, and engineering coordination legible to both humans and agents.

Five pillars:

- A **central knowledge base** (RAGFlow, headless) is the foundation.
- **Hermes** (on Slack, LLM = OpenRouter) is the gateway and coordinator — the only thing users touch.
- The **tracker** (Jira now → Linear) is the tracked-work spine; **Slack** is conversation.
- **CMS MCP** provides live tenant state for real support/onboarding.
- **Public context** (`llms.txt`) maps public docs for agents.

Two outcomes: internally, a more reliable remote operating model; externally, stronger AI-assisted CMS setup and support for newsrooms without losing human control.

## Operating model

- **Slack** = conversation, not durable truth.
- **Linear** = tracked work: support escalations, onboarding blockers, developer tasks, with owner/status/acceptance criteria.
- **Knowledge base** = durable truth: support patterns, decisions, runbooks, developer context, per-newsroom knowledge, reviewed media-setup summaries.
- **Hermes** reads the KB first, calls MCPs only for live/current context, drafts replies/issues/briefs/KB updates. It does not merge PRs or mutate CMS without explicit human approval.

## Knowledge base design

**RAGFlow** (headless, Apache-2.0; chosen via bake-off — `BAKEOFF_RESULTS.md`) indexing three namespaces: `public`, `internal`, `newsroom:{slug}`, with `bge-m3` multilingual embeddings. No end user logs into it; Hermes is the only client and scopes every query. Sources are **routed by type** (code→live MCP, issues→summaries, docs→scrape, Slack→Hermes), not dumped raw.

Knowledge enters by **schema-on-ingest, not a hand-maintained git vault** — hand-authored markdown across teams and many newsrooms is unmaintainable, and newsrooms want Hermes to ingest *their* knowledge (design rules, audiences, CMS use, integrations) conversationally. Structure is enforced at ingestion time via tagging (`namespace`, `type`, `newsroom`, `source`, `confidence`, `owner`, `last_updated`), not folder discipline. Newsroom-asserted facts are tagged `unverified` and kept separate from We.Publish-verified knowledge. (Full detail: `KNOWLEDGE_BASE_SPEC.md`.)

## MCP strategy

Three narrow surfaces (full detail: `MCP_DELIVERY_SPEC.md`):

- **RAGFlow MCP** — search the indexed namespaces (Hermes + developer agents).
- **CMS MCP** — the critical custom build: curated, authenticated live-CMS diagnostics (read-only first, gated writes later). No arbitrary GraphQL. This is where the real engineering effort and value sit; start it early, in parallel.
- **Developer Context MCP** — live GitHub code/file lookup at HEAD (code is never embedded into the KB).

## Public context: `llms.txt`

`llms.txt` / `llms-full.txt` are public agent entry points published to `apps/wepublish-site` and indexed into the `public` namespace. They map public docs, concepts, repos, and support routes, and state what is private. They contain no private media state, internal strategy, credentials, or live CMS data. (Detail: `LLMS_PUBLIC_CONTEXT_SPEC.md`.)

## Skills (Hermes workflows)

Initial: `support-triage`, `onboarding-triage`, `cms-mcp-operator`, `payment-setup`, `kb-ingest` (chat/uploads/threads → tagged namespace chunks), `developer-briefing`, `kb-maintenance`.
Later: `newsroom-setup-preflight`, `peering-setup`, `subscription-debugging`, `release-notes-to-kb`, `media-handoff`.

## Workflows

**Support:** request in Slack/Linear → `support-triage` → Hermes reads KB first → read-only CMS MCP if live state matters → drafts reply → creates/routes Linear issue to a developer → after resolution proposes a KB support-pattern update.

**Onboarding:** request → `onboarding-triage` → identify newsroom/phase/blockers → CMS MCP read report → checklist + required human actions → collected data written to CMS via gated CMS MCP (not the index) → setup summary ingested to the newsroom namespace.

**Developer:** Linear issue → `developer-briefing` → Hermes reads KB + support history + setup state + decisions → Developer Context MCP for code → optional overnight Codex attempt on labeled issues → human reviews/approves/merges. Agents never merge.

## 60-day rollout

- **Weeks 1–2:** deploy RAGFlow headless (resized `onyx01`) with the three namespaces + `bge-m3`; **start CMS MCP read-only in parallel**; stand up Hermes on Slack (OpenRouter) against RAGFlow's `/retrieval`; doc-scrape into `public`/`internal`; draft `llms.txt`; define tracker (Jira/Linear) templates.
- **Weeks 3–4:** Hermes support-triage with human-approved drafts; weekly KB maintenance; finish CMS MCP read-only diagnostics; first reviewed support patterns ingested.
- **Weeks 5–6:** first `newsroom:{slug}` namespace; conversational onboarding ingest; CMS onboarding reports; pilot one newsroom; no-answer review.
- **Weeks 7–8:** optional public docs surface (`public` only); Developer Context MCP in developer briefs; begin gated CMS write-tool design; review outcomes and decide the next phase.

## Governance and safety

Hermes reads KB first · Slack is conversation · Linear is tracked work · KB is durable truth · CMS MCP for live state/gated actions · no agent merges PRs · no CMS mutation without dry-run + approval + audit · newsroom isolation enforced by Hermes scoping · sensitive data never enters the index.

Access tiers: **public** (site/docs/`llms.txt`) · **internal** (KB internal namespace, Linear, Developer Context MCP) · **restricted** (CMS MCP, newsroom namespaces, payment/subscription config) · **human-approved only** (CMS mutations, production changes, PR merges).

## Acceptance criteria

Leadership understands the operating model, why the KB comes first, the MCP boundaries, and what Hermes can/can't do. Engineering can start from the namespaces, the skill list, the CMS MCP tool list, and the bake-off. Support sees where requests arrive, how replies are drafted, how issues are escalated, and where human approval is required.

## Open decisions

Resize `onyx01` → CPX41 (16 GB min; deferred) · OpenRouter production model · first pilot newsroom · Jira→Linear timing · whether doc-scrape + Developer Context MCP merge into one service.
