---
status: active
type: feat
created: 2026-06-10
origin: wp-knowledge/MCP_DELIVERY_SPEC.md + repo research (wepublish/wepublish, wepublish-mcp, wepublish-ai-support-agent)
target_repo: wepublish-cms-mcp (+ wp-knowledge specs)
supersedes_partially: 2026-06-10-001 (build plan) — corrects auth/tenancy/transport assumptions
---

# feat: We.Publish MCP architecture & handoff

**Context for this plan:** Tom is a departing contractor. Everything must land in infrastructure the We.Publish team **already runs and can maintain without him**. The plan is grounded in direct reading of three repos (file refs throughout): the `wepublish/wepublish` monorepo, `wepublish/wepublish-mcp`, and the private `wepublish/wepublish-ai-support-agent`.

## Summary

The earlier build plan (001) produced a working CMS-admin diagnostics MCP, but on **three wrong assumptions** the repo research disproved. This plan (a) corrects them, (b) decides repo topology + transport so the server deploys on We.Publish's existing infra, and (c) reframes "Hermes" against the fact that **We.Publish already ships a Slack+Claude+MCP support agent**. The throughline is *minimise new operational surface for a team we're leaving*.

## Load-bearing findings (verified against source)

| # | Finding | Evidence | Impact on what we built |
|---|---|---|---|
| F1 | API is one endpoint at **`/v1`** (merged public+admin schema; access via `@Public()`/`@Permissions()` decorators) | `apps/api-example/src/nestapp/app.module.ts:128` | `WEPUBLISH_API_URL` must end `/v1`, not `/graphql` |
| F2 | Headless auth = **long-lived peer token** + **`User-Agent: We.Publish/1.0 Peering`**; without that exact UA the token is treated as a user session | `libs/authentication/api/src/lib/session.strategy.ts:7,20-27` | client must send the UA header; token via `createToken` mutation |
| F3 | **Tenancy is per-deployment** — one API + Postgres per newsroom; **no tenant header/field exists** | `libs/api/prisma/schema.prisma` (no tenant field); no tenant in GQL context | our `x-wepublish-tenant` header is dead; "tenant" must mean "which configured upstream", not a header |
| F4 | Admin reads are **permission-gated** (`@Permissions(CanGetPaymentMethods)`, `CanGetSubscriptions`, `CanGetSettings`); `memberPlans`/`navigations`/`peerProfile` are `@Public()` | `libs/payment/api/.../payment-method.resolver.ts:51`; member-plan/navigation resolvers | the peer token's role must carry the admin read permissions |
| F5 | **A "Hermes" already exists**: `wepublish-ai-support-agent` (private) — Slack (Bolt) + Anthropic Claude SDK + MCP client → `https://mcp.wepublish.cloud` | repo exists (pushed 2026-02-23); MCP client base in its `src/mcp-client.ts` | don't build a parallel OpenRouter Hermes from scratch; extend theirs |
| F6 | `wepublish-mcp` is the **public/dev-context MCP** (GitHub + GitBook + wepublish.ch fetch), HTTP/Streamable transport, `/mcp` + `/healthz`, `node:22-alpine`, non-root UID 1001, CI → `ghcr.io/wepublish/wepublish-mcp`, deployed at `mcp.wepublish.cloud` | `wepublish-mcp` Dockerfile, `.github/workflows/docker.yml`, `src/index.ts` | our CMS MCP should match this packaging + transport to be deployable/maintainable |
| F7 | Org convention = **satellite repos** (wepublish-mcp, wepublish-ai-support-agent, labs, …); monorepo is **MIT**; security CI = TruffleHog+CodeQL+Trivy; CODEOWNERS `@itrulia` | `gh repo list wepublish`; monorepo `LICENSE`, `.github/workflows/security-scan-pr.yml`, `CODEOWNERS` | CMS MCP = separate MIT satellite repo with their CI conventions |

## Key technical decisions

- **KTD1 — Separate satellite repo `wepublish/wepublish-cms-mcp`.** Matches the org's satellite pattern (F7) and keeps **admin-auth tools isolated from the public server** — which is exactly the split We.Publish itself already makes (public `wepublish-mcp` vs private `wepublish-ai-support-agent`). Not folded into `wepublish-mcp`; not a monorepo PR. License **MIT** (matches the association's ownership; the existing mcp's ISC is an inconsistency we won't copy).
- **KTD2 — Streamable HTTP transport (keep stdio for local dev).** Mirror `wepublish-mcp` exactly: `/mcp` endpoint, `GET /healthz`, optional `MCP_AUTH_TOKEN` bearer, `PORT`/`HOST`, `MCP_ALLOWED_HOSTS`. This is what makes it deployable on their K8s/ghcr and consumable by `wepublish-ai-support-agent`'s MCP client. (Our build is stdio-only — a real gap.)
- **KTD3 — Correct the upstream client (F1/F2):** default `WEPUBLISH_API_URL=https://api.<newsroom>/v1`; always send `User-Agent: We.Publish/1.0 Peering`; `Authorization: Bearer <peer token>`. **Remove `x-wepublish-tenant`.**
- **KTD4 — Tenancy = per-configured-upstream (F3).** Two supported modes: (a) **single-newsroom** (one `WEPUBLISH_API_URL`+token from env — matches their per-deployment model, cleanest isolation) and (b) **fleet** (a config map `slug → {apiUrl, token}`; a `newsroom` arg selects a *configured* upstream, never an arbitrary header/URL). Fail closed on unknown slug. No arbitrary upstream is ever reachable.
- **KTD5 — Don't build a parallel Hermes; extend `wepublish-ai-support-agent` (F5).** The handoff-optimal path is to register the CMS MCP as a second MCP the existing agent calls, rather than stand up a bespoke OpenRouter+RAGFlow Hermes the team would have to operate after we leave. *(This is a strategic fork — see Open decisions; it has implications for the whole wp-knowledge "Hermes/RAGFlow" design.)*
- **KTD6 — Handoff conventions:** MIT `LICENSE`, `CODEOWNERS @itrulia`, ghcr `docker.yml` CI (copy `wepublish-mcp`'s), security-scan workflow (TruffleHog/CodeQL/Trivy), prettier/eslint matching the monorepo (`printWidth 80, singleQuote, no-semi? — match .prettierrc`), Node 22, `node:22-alpine` non-root UID 1001 Dockerfile, `/healthz`.
- **KTD7 — Staging = their own dev stack.** Validation runs against `npm run start:docker` + `npm run migrate` + `npm run watch:api-example` (API at `localhost:4000/v1`), with a peer token minted in the editor. No bespoke staging for them to maintain.

## High-level architecture (target)

```
Slack ──> wepublish-ai-support-agent  (their shipped agent: Bolt + Claude + MCP client)
                 │  MCP (HTTP, mcp.wepublish.cloud-style)
        ┌────────┼─────────────────────────────┐
        ▼        ▼                              ▼
 wepublish-mcp   wepublish-cms-mcp (NEW)        (optional later) KB/RAG MCP
 (public/dev)    admin diagnostics, per-newsroom
                       │ Bearer peer token + UA "We.Publish/1.0 Peering"
                       ▼
                 We.Publish API  /v1  (one deployment per newsroom)
```

The CMS MCP is one more satellite behind the agent they already run. No new always-on infra of ours (RAGFlow/OpenRouter-Hermes) is required for the support/diagnostics use case.

---

## Implementation units

### U1. Correct the upstream client (auth, endpoint, UA; drop tenant header)
**Goal:** Make the typed client speak the real API contract.
**Requirements:** F1, F2, F3.
**Files:** `src/client.ts`, `test/client.test.ts`, `.env.example`, `README.md`.
**Approach:** default API URL ends `/v1`; always send `User-Agent: We.Publish/1.0 Peering` + `Authorization: Bearer`; **delete `TENANT_HEADER`** and its usage. Keep the no-raw-query guarantee.
**Test scenarios:** headers include the exact UA + bearer; no `x-wepublish-tenant` present; timeout/error normalization unchanged.
**Verification:** client tests green; grep shows no tenant header anywhere.

### U2. Rework tenancy to per-configured-upstream
**Goal:** Replace the per-call `tenant` header with upstream selection (KTD4).
**Dependencies:** U1.
**Files:** `src/config.ts`, `src/tools/helpers.ts`, all `src/tools/*.ts` (the `tenant` arg becomes a `newsroom` selector), `src/tools/types.ts`, tests.
**Approach:** config supports single-upstream (env) OR a `WEPUBLISH_UPSTREAMS` JSON map `slug→{apiUrl,token}`. `clientFor(slug)` resolves to a configured upstream or fails closed. Single-mode ignores the arg (one newsroom).
**Execution note:** test-first on the fail-closed unknown-slug path.
**Test scenarios:** single mode answers with no arg; fleet mode selects the right upstream; unknown slug → fail closed; no way to pass an arbitrary URL/token.
**Verification:** tests green; envelope `tenant` now reflects the selected newsroom slug.

### U3. Add Streamable HTTP transport (keep stdio)
**Goal:** Deployable like `wepublish-mcp`.
**Dependencies:** U1.
**Files:** `src/index.ts` (stdio, unchanged default), `src/http.ts` (new: express + `StreamableHTTPServerTransport`, `/mcp`, `GET /healthz`, optional `MCP_AUTH_TOKEN`, `PORT`/`HOST`/`MCP_ALLOWED_HOSTS`), `package.json` (add `express`), `test/http.test.ts`.
**Patterns to follow:** `wepublish-mcp/src/index.ts` HTTP setup (copy structure + SSRF/allowed-hosts pattern).
**Test scenarios:** `/healthz` returns ok; `/mcp` initialize+tools/list returns the 8 tools; missing `MCP_AUTH_TOKEN` (when configured) → 401.
**Verification:** `curl /healthz`; HTTP JSON-RPC lists 8 tools.

### U4. Permissions + token doc; validate against the real dev stack
**Goal:** Make first-real-run runnable by the team.
**Requirements:** F4, KTD7.
**Files:** `README.md`, `docs/staging-and-token.md`.
**Approach:** document minting a peer token (role with `CanGetPaymentMethods`, `CanGetSubscriptions`, `CanGetSettings`, …) via the editor/`createToken`; point `WEPUBLISH_API_URL` at `localhost:4000/v1`; run the 8 tools; record any field-selection drift. No bespoke staging.
**Test expectation:** none (docs); behavior covered by U1–U3.
**Verification:** a maintainer can follow the doc to validate end-to-end without Tom.

### U5. Handoff packaging to We.Publish conventions
**Goal:** Repo is instantly maintainable by them.
**Requirements:** F6, F7, KTD6.
**Files:** `LICENSE` (MIT, We.Publish Association), `CODEOWNERS`, `Dockerfile` (node:22-alpine multi-stage, non-root UID 1001), `.dockerignore`, `.github/workflows/docker.yml` (→ `ghcr.io/wepublish/wepublish-cms-mcp`), `.github/workflows/security-scan-pr.yml`, `.github/workflows/lint-test.yml`, `.prettierrc`/eslint to match monorepo.
**Test expectation:** none (config); CI must run green.
**Verification:** Docker image builds; lint/test/security workflows valid; image runs `/healthz`.

### U6. Reposition the existing wepublish-mcp + update wp-knowledge specs
**Goal:** Specs reflect reality, not a greenfield fiction.
**Files:** `wp-knowledge/MCP_DELIVERY_SPEC.md`, `AI_SUPPORT_ARCHITECTURE_SPEC.md`, `AI_STRATEGY.md`, `README.md`.
**Approach:** record that the Developer Context MCP **already exists** (`wepublish-mcp` at `mcp.wepublish.cloud`); the CMS MCP is the new satellite; auth/tenancy corrected (F1–F4); and the "Hermes" decision is reframed against `wepublish-ai-support-agent` (KTD5) with the strategic fork called out.
**Verification:** no spec still claims `/graphql`, a tenant header, or a from-scratch Developer Context MCP.

### U7. (Conditional on KTD5 decision) Integration path into wepublish-ai-support-agent
**Goal:** Wire the CMS MCP into the agent they run — or document the alternative.
**Dependencies:** U3; Open-decision OD2.
**Files:** `docs/agent-integration.md` (how to register `wepublish-cms-mcp` as a second MCP in the agent's MCP client config; auth; per-newsroom upstream selection).
**Approach:** if extending their agent (recommended), document the MCP registration + a guard so admin tools are only callable in authenticated/internal contexts. If building a separate Hermes instead, document why and the added operational cost.
**Verification:** a maintainer can add the CMS MCP to the agent from the doc alone.

---

## Scope boundaries

In scope: correcting + repackaging the CMS MCP for handoff; spec reconciliation; the agent-integration path.

### Deferred to follow-up work
- **CMS write tools** (phase 2, gated) — unchanged, still out.
- **The RAGFlow/KB question.** F5 implies the handoff lens may argue against self-hosting RAGFlow + a bespoke Hermes at all (more infra for a team we're leaving). That is a **separate strategic decision** (OD3), not resolved here.
- **Productionising multi-newsroom fleet config** beyond the `WEPUBLISH_UPSTREAMS` map.

## Risks & mitigations
- **Peer-token role scope** — if the token lacks `CanGet*` permissions, admin reads 401. Mitigation: U4 documents the exact permissions; tools already fail closed.
- **Admin tools reachable publicly** — HTTP transport widens exposure vs stdio. Mitigation: `MCP_AUTH_TOKEN` required in HTTP mode + internal-network/allowed-hosts; admin MCP never deployed to the public `mcp.wepublish.cloud` surface.
- **Reframing Hermes mid-stream** — extending their private agent depends on access + their buy-in. Mitigation: U7 is conditional; the MCP is useful regardless of which agent calls it.
- **Schema drift** — vendored schema vs live. Mitigation: codegen + first-run validation (U4); refresh script.

## Open decisions (Tom)
- **OD1 — Repo topology:** separate `wepublish-cms-mcp` satellite (recommended) vs fold into `wepublish-mcp`. *Recommend separate (trust isolation + org convention).*
- **OD2 — Hermes:** extend `wepublish-ai-support-agent` (recommended, minimal new surface) vs build the bespoke OpenRouter Hermes from wp-knowledge.
- **OD3 — RAGFlow/KB:** does the "minimise infra we leave behind" lens change the self-hosted-RAGFlow decision? (Separate review; flagged, not decided here.)
- **OD4 — Push target/timing:** create `wepublish/wepublish-cms-mcp` now (needs org push rights / CTO) vs stage under `buriedsignals` and transfer on adoption.

## Adversarial review — integrated findings & revisions (2026-06-10)

An adversarial pass against source found one **blocker** that invalidates the auth premise of both this plan and plan 001, plus several corrections. All verified against files.

- **B1 (BLOCKER) — No supported way to mint a token with the needed permissions.** `CreateTokenInput = PickType(TokenWithSecret, ['name'])` (`libs/peering/api/src/lib/token.model.ts:39`) — name only. `createToken` never sets `roleIDs` (`token.service.ts:18`) → empty → zero permissions. No `updateToken` mutation; no editor UI for token roles. The `peer` role lacks `CanGetPaymentMethods/CanGetSubscriptions/CanGetSettings` (`permissions.ts`, `PeerPermissions` ≠ those). **Every `@Permissions`-gated admin read returns forbidden.** F2/F4/KTD3/U4 as written are undeliverable.
  - **Revision — new prerequisite U0 (must precede U4 validation):** close the token-permission gap one of two ways:
    1. **Upstream PR (recommended)** to `wepublish/wepublish`: add `roleIDs` to `CreateTokenInput`/`UpdateTokenInput` + an `updateToken` mutation + an editor role-picker, so the team can mint a **scoped** service token (custom role carrying only the three `CanGet*` read perms — *not* `admin`) through supported, maintainable means. **This is the one legitimate monorepo PR in this effort** (it fixes We.Publish, not the MCP) — overriding the earlier "no monorepo PR" stance, which was about the MCP code, not this gap.
    2. **Fallback:** document a one-time DB step (`UPDATE tokens SET role_ids='{<scoped-role-id>}'`) — explicitly a landmine; only if the PR is rejected/slow.
  - Until U0 lands, the tools fail closed on every call; do not claim a working diagnostics MCP.
- **B2 (BLOCKER) — built client never sends the peer `User-Agent`,** so today it takes the user-session path and fails regardless of token. Folded into U1 (it was understated as a URL tweak; the build is currently non-functional against a real server).
- **R3 (MAJOR) — fleet mode is a credential-concentration anti-pattern.** Tokens are stored **plaintext** (`Token.token` unhashed; `tokens` query returns them). **Revision:** default to single-newsroom; if fleet ships, scoped-read role only (post-U0), tokens from a secrets manager at call time (not a config map), explicit blast-radius doc. KTD4 amended.
- **R4 (MAJOR) — KTD5 (extend `wepublish-ai-support-agent`) was overreach and wrong on facts.** That repo is single-MCP (`MCP_BASE` hardcoded), prompt-architected to **refuse** admin/technical content, has no per-user authz, is **Anthropic-direct not OpenRouter**, and is **private with only `push` access that lapses on departure**. **Revision:** demote KTD5 from "recommended" to a flagged option. The CMS MCP stays **agent-agnostic**; *which* agent calls it (their support bot, a new Hermes, or direct dev/MCP use) is a separate We.Publish decision (OD2) that must be implemented + merged by a We.Publish maintainer before departure, not by Tom in a repo he'll lose. The CMS MCP's correctness does not depend on it. U7 becomes "document the integration contract," not "wire into their private agent."
- **R5 (MAJOR) — admin HTTP exposure asserted, not enforced. Revision:** `MCP_AUTH_TOKEN` is **mandatory** in HTTP mode (refuse to boot if unset — do *not* copy `wepublish-mcp`'s optional pattern); isolation enforced by an internal-only Service/NetworkPolicy (no public Ingress), not a deployment convention. KTD2/U3/U5 amended.
- **R6 (MINOR) — governance overreach.** The MIT-vs-ISC license choice and CODEOWNERS are `@itrulia`'s call, not the contractor's. **Revision:** ask the CODEOWNER; default to matching the sibling satellite. Read the real `.prettierrc` (don't guess). KTD1/KTD6 amended.
- **Correction to the Summary's "working CMS-admin diagnostics MCP":** it is a **compiling, mock-unit-tested** MCP that has **never authenticated against a live server**. Treat "8 tools" as built-not-validated until U0+U4.

**Net:** plan 001's three corrections (/v1, dead tenant header, per-deployment tenancy) hold. But the auth path (B1) is the real gate — nothing runs until the token-permission gap is closed upstream. Sequence: **U0 → U1 → U2 → U4 (live validation) → U3/U5 → U6 → OD2/U7.**

## Sources
- `wepublish/wepublish@development`: `apps/api-example/src/nestapp/app.module.ts`, `libs/authentication/api/src/lib/session.strategy.ts`, `libs/payment/api/.../payment-method.resolver.ts`, `libs/api/prisma/schema.prisma`, `.ai/*`, `LICENSE`, `.github/workflows/*`, `CODEOWNERS`.
- `wepublish/wepublish-mcp`: `Dockerfile`, `.github/workflows/docker.yml`, `src/index.ts`, `.env.example`.
- `wepublish/wepublish-ai-support-agent` (private): exists; Slack+Anthropic+MCP-client → `mcp.wepublish.cloud`.
- Discussion logs: handoff constraint, two-trust-tier model, CMS MCP build (plan 001).
