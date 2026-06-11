# Hermes Spec — The Gateway

Status: draft for review
Updated: 2026-06-11

> **Implementation (OD2 resolved 2026-06-11; topology refined same day; routing revised
> again same day):** Hermes = the NousResearch `hermes-agent` runtime. **One Slack app ⇒
> one gateway ⇒ the `internal` profile (Aldus) serves ALL Slack channels** — Socket Mode
> load-balances events across connections, so per-newsroom profiles/gateways are not
> possible with a single app (and multiple apps are ruled out). Newsroom isolation =
> channel→dataset map enforced in the skills + trusted channel-ID env injection (upstream
> hermes-agent contribution, prerequisite) + memory restrictions + isolation probes.
> Newsrooms still never touch RAGFlow in any form.
> Slack and MCP are native — no gateway code to write. **Ingest is chat-driven via the
> hardened `kb-ingest` skill** (deterministic script owns the write; dataset allowlist +
> forced `newsroom-asserted`/`unverified` tags in support profiles; `confirmed` requires
> `--reviewed-by`); cron scrapes come later. **Phase-1 tracker = GitHub Issues** (replaces
> Jira-now/Linear-later; "Linear" below reads as "GitHub Issues"). Developer MCP access to
> the KB: deferred. Configs + skills: `labs/src/hermes/`. `wepublish-ai-support-agent` was
> audited and dropped (only its editorial prompt wording survives, in the support-template
> SOUL.md).

> Infra/topology/SSH/cost live in `AI_SUPPORT_ARCHITECTURE_SPEC.md`. Hermes runs on `hermes01`.

## Decision

Hermes **is the architecture**. It runs **on Slack** with **OpenRouter** as its LLM (`anthropic/claude-haiku-4.5` default; key in gitignored `openrouter.txt`). The engine (**RAGFlow**) is a swappable backend beneath it. Hermes provides everything the engine does not: tenant scoping, **ingestion (routed by source type)**, triage, CMS diagnostics, ticket routing, human gates, and post-resolution KB updates.

> Tracker: **Jira today, Linear later.** Hermes ingests reviewed issue *summaries* and creates/routes tickets in whichever is current — switching = swapping Hermes's tracker adapter, engine untouched. "Linear" below = "the tracker."

Responsibilities:

1. **Gateway** — newsrooms (Slack) and developers (MCP/Slack) enter through Hermes. No one logs into RAGFlow.
2. **Policy-enforcement point** — Hermes holds the only scoped RAGFlow credentials and scopes every query to a namespace (`public` / `internal` / `newsroom:{slug}`) via per-dataset filters. This is how newsroom isolation is enforced without per-user RBAC.
3. **Ingestion pipeline (by source type)** — code → live GitHub MCP (never embedded); issues/tickets → reviewed summaries; docs → scheduled scrape; Slack → summaries; newsroom knowledge → conversational + uploads. All become tagged chunks (schema-on-ingest) pushed to the right namespace via RAGFlow's ingestion API.
4. **Triage + answer drafting** — classifies intent, retrieves, drafts answers under the answer contract.
5. **CMS diagnostics** — calls CMS MCP read tools when live tenant state matters.
6. **Routing** — creates/enriches Linear issues; routes newsroom requests to developers.
7. **Human gates** — drafts; humans approve external replies, CMS writes, and `confirmed` promotions.

## Surfaces

| Surface | Audience | Scope | Notes |
|---|---|---|---|
| Newsroom support/onboarding | clients | `public` + their `newsroom:{slug}` + CMS MCP read | Slack channel or support portal. Human-approved replies during pilot. |
| Internal Hermes | staff/support/devs | `public` + `internal` + role-based newsroom access | morning briefs, triage, onboarding reports, developer briefs. |
| Developer (MCP) | developers | `public` + `internal` via engine MCP | inside Claude Code/Codex/Cursor; plus Developer Context MCP for live code. |

There is **no public engine widget in phase 1**. If a public docs chat is added later, it is a thin surface restricted to the `public` namespace — still not direct engine login.

## Request flow

1. Receive request; identify user, newsroom, channel, intended audience.
2. Detect sensitive/regulated data.
3. Classify intent (public docs / newsroom setup / payments-subscriptions / navigation-branding / peering / bug / developer / funding).
4. Query the engine at the **narrowest valid namespace**.
5. If live tenant state matters, call CMS MCP read tools.
6. Draft answer per the answer contract.
7. If tracked work is needed, create/update Linear and route to a developer.
8. If customer-visible, require human approval (pilot).
9. After resolution, propose KB updates (support pattern / setup summary / docs fix).

## Answer contract

```text
Answer: ...
Source: ...                         (citations, or "not found in the knowledge base")
Confidence: Confirmed / Likely / Unverified / Not found
CMS state: checked (<tool>) / not checked / not needed
Provenance: We.Publish-verified / newsroom-asserted   (never blur the two)
Next step: ...
```

## Onboarding via Hermes

Hermes collects newsroom setup info conversationally, answers onboarding questions from `public` + that newsroom's namespace, identifies missing fields, generates an onboarding package, runs read-only CMS MCP diagnostics, routes blockers to Linear, and **writes the collected operational data into the CMS via CMS MCP** (gated) so the newsroom doesn't fill it in manually. Onboarding never writes production CMS state without dry-run + human approval + audit.

## Human gates

Approval required before: external replies (pilot), client-visible commitments, closing support issues, any CMS write, payment/subscription/member-plan/peering/navigation changes, handling sensitive data, and promoting a KB item to `confirmed`.

## Linear use

Create/enrich a Linear issue when work needs engineering, blocks publishing/payments/onboarding/launch, repeats a pattern, needs approval, or is a change request. Issue includes: newsroom, requester, workflow, urgency, source request, engine citations, CMS diagnostics, related patterns, repro steps, proposed owner, acceptance criteria.

## Operating rules

- Hermes reads the KB first; CMS MCP only for live state; Developer Context MCP only for live code.
- Hermes does not maintain a competing knowledge store.
- Hermes uses scoped engine service tokens, never admin tokens.
- Hermes on Slack is internal; it is not the public support widget.
- No PR merges; no CMS writes without dry-run + approval + audit.

## Pilot plan

1. **Internal only** — Hermes answers staff questions from `internal`; CMS read diagnostics; Linear drafts; no customer-visible auto-replies.
2. **One newsroom** — authenticated newsroom support via its namespace; human approval required; measure answer quality + escalation + isolation.
3. **Public docs** (optional) — `public`-only surface, no live CMS, no internal citations.

## Acceptance criteria

- Namespaces configured; Hermes scopes correctly (isolation probes pass).
- support-triage implemented; answer contract enforced; CMS read tools available.
- Linear templates exist; 30 representative prompts tested.
- Unsupported questions escalate; newsroom A cannot retrieve newsroom B.
