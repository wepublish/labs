# MCP Delivery Spec

Status: draft for review
Updated: 2026-06-10

> Deployment/topology lives in `AI_SUPPORT_ARCHITECTURE_SPEC.md`. CMS MCP and Developer Context MCP run on `hermes01`.

> **Update (2026-06-11):** RAGFlow MCP is used by the **internal Hermes profile only** in phase 1 — support profiles retrieve via a scoped skill (pinned `dataset_ids`), and developer/coding-agent access is deferred. KB writes go through the `kb-ingest` skill, never an MCP. Tracker rows below: phase 1 = GitHub Issues.

Three MCP surfaces, narrow purposes, no collapsing into one generic tool:

| Interface | Purpose | Audience | Must not |
|---|---|---|---|
| **RAGFlow MCP** | search the indexed KB namespaces | Hermes, developer agents | mutate CMS; expose other namespaces through a scoped token |
| **CMS MCP** | live CMS tenant diagnostics → gated writes | Hermes under auth | expose arbitrary GraphQL; answer broad docs questions |
| **Developer Context MCP** | **live GitHub code/file lookup at HEAD** | internal engineering | embed code into the KB; serve customer-facing answers |

## RAGFlow MCP

RAGFlow ships an MCP server. Hermes and developer agents use it (plus the `/retrieval` HTTP API) to search the same index instead of building separate vector stores.

- Tools: search a dataset (namespace), list indexed sources, fetch/open source.
- Scoping: Hermes passes `dataset_ids` for the requester's namespace(s). A `public` query never reaches `internal`/newsroom datasets.
- Auth: RAGFlow API key for Hermes (scoped); developer PATs. No admin tokens in agent configs.
- Acceptance: scoped retrieval returns only the allowed namespace; citations preserve source URLs.

## CMS MCP — the real project

The most important custom build. Live tenant state is the only thing a KB cannot provide ("is this newsroom's payment setup correct *right now*?"). Build on **curated workflow tools over the We.Publish GraphQL API**, never a generic GraphQL shell.

### Required constraints (every call)

tenant/site scope · environment scope · authenticated actor · role checks · allowlisted tools only · typed input/output schemas · redaction of secrets/payment/member data · audit logging · no arbitrary GraphQL · no public access. Every **write**: dry-run mode · idempotency key · human-approval reference · before/after diff · rollback guidance.

### Read tools (phase 1)

- `cms_get_site_profile`
- `cms_get_setup_status`
- `cms_check_payment_setup`
- `cms_check_subscription_setup`
- `cms_check_member_plans`
- `cms_check_peering_status`
- `cms_check_navigation_domain_branding`
- `cms_generate_onboarding_report`

Each read returns: tenant/env, timestamp, principal, source API version, status, findings, redacted values, next checks.

### Write tools (phase 2, gated)

- `cms_update_basic_site_settings`
- `cms_update_payment_settings`
- `cms_create_or_update_member_plan`
- `cms_update_navigation`
- `cms_apply_onboarding_step`

Onboarding-specific (after read-only onboarding is stable): `cms_preview_newsroom_setup` (dry-run diff), `cms_apply_newsroom_setup_step` (gated), `cms_finalize_newsroom_launch_check`. Names are workflow-level, never 1:1 with raw mutations.

### Acceptance

- Read: authenticates to staging tenant; structured JSON; secrets redacted; unknown tenant fails closed; unauthorized actor blocked; output usable in a Linear issue and as an indexed reviewed summary.
- Write: dry-run produces a diff without mutating; missing approval blocks; wrong tenant blocks; audit records actor/approval/diff/timestamp; repeated idempotency key does not duplicate.

## Onboarding automation (where the data goes)

Onyx-style "engine chat does writes" is **out**. Newsroom onboarding data Hermes collects is written into the **CMS via CMS MCP** (gated), not stored in the index. A deterministic onboarding script may validate input, normalize slug/domain/social metadata, scaffold draft KB pages, and produce a JSON package for CMS MCP dry-run — but it must not bypass CMS MCP for production writes.

| Tool/endpoint | Phase | Mutation |
|---|---|---|
| `onboarding_validate_input` | 1 | no |
| `onboarding_generate_package` | 1 | no |
| `onboarding_scaffold_media_pages` | 1 | no live CMS mutation |
| `cms_generate_onboarding_report` | 1 | no |
| `cms_preview_newsroom_setup` | 2 | no (dry-run) |
| `cms_apply_newsroom_setup_step` | 2 | yes, gated |
| `cms_finalize_newsroom_launch_check` | 2 | narrow gated reads |

## Developer Context MCP

**Code is never embedded into the KB** (embeddings go stale; code-RAG is weak). Code lives here as **live lookup at HEAD**. Docs (GitBook/site) are handled by the doc-scrape into the `internal`/`public` namespaces, not by this MCP.

- Tools: `wepublish_github_search_code`, `wepublish_github_get_file` (live, at HEAD). Optionally `wepublish_gitbook_fetch_page` / `wepublish_ch_fetch_url` for live doc fetches.
- Issues/tickets (Jira → Linear) are **not** here — Hermes ingests reviewed summaries into `internal`, or live-queries the tracker API at answer time.
- May be the existing `wepublish-mcp` repositioned, or merged with the doc-scrape into one ingestion/lookup service.

We.Publish API basis: the CMS API is Apollo GraphQL with generated hooks/documents and a `/v1` convention. CMS MCP sits **above** it with stable support/onboarding operations. Public docs: `docs.wepublish.ch/developers/website-builder/*`, `/developers/api`.

## Hermes decision order

1. Search RAGFlow first.
2. If live CMS state matters → CMS MCP read tools.
3. If live code context needed → Developer Context MCP (GitHub at HEAD).
4. If tracked work → create/route a ticket (Jira now → Linear).
5. Draft with sources + confidence + provenance.
6. Human approval for external replies and writes.

## Delivery order

1. Deploy RAGFlow + enable its MCP.
2. Build CMS MCP read-only (start in parallel — longest lead).
3. Reposition existing `wepublish-mcp` as Developer Context MCP (live GitHub).
4. Integrate Hermes with RAGFlow `/retrieval` + CMS reads.
5. Add Developer Context MCP to developer-brief workflow.
6. Add gated CMS writes only after read-only is stable.

## Security

Scoped service tokens for Hermes; user PATs/SSO for developers; no admin keys in configs or clients; record every CMS MCP call (actor/tenant/tool/timestamp/result); redact before sending CMS output to the engine or Linear; treat engine namespace scoping as a security boundary, not a convenience.
