---
status: active
type: feat
created: 2026-06-10
origin: wp-knowledge/MCP_DELIVERY_SPEC.md
target_repo: wepublish-cms-mcp
---

# feat: We.Publish CMS MCP — read-only diagnostics

**Target repo:** `wepublish-cms-mcp` (new; to be created at `wepublish/wepublish-cms-mcp/`). All file paths below are relative to that repo root.

## Summary

A standalone, read-only MCP server exposing eight curated diagnostic tools over the We.Publish **admin** GraphQL API (`apps/api`, NestJS code-first, served at `/graphql`). It is the "real project" of the wp-knowledge architecture: live tenant state is the one thing the RAGFlow knowledge base cannot provide. Hermes (on `hermes01`) is the only caller. This phase builds and unit-tests every tool against the **vendored schema + mocked GraphQL fixtures** — no live endpoint is required to ship it — with endpoint/token injected by env. Curated workflow tools only; never an arbitrary GraphQL passthrough.

## Problem frame

`MCP_DELIVERY_SPEC.md` requires curated, authenticated, redacted, audited read tools that answer "is this newsroom's setup/payment/subscription/peering correct *right now*?". The constraints (tenant scope, redaction of secrets/payment/member data, typed I/O, audit logging, no arbitrary GraphQL, fail-closed on unknown tenant) are security requirements, not nice-to-haves. We have **no staging endpoint or credentials** — only the public repo. So the build targets the committed schema (`apps/api-example/schema-v2.graphql`, 4367 lines) as ground truth and proves behavior with fixtures; live validation is deferred until an endpoint exists.

## Key technical decisions

- **TypeScript + Node 22** (`.tool-versions` pins `nodejs 22.20.0`), matching the wepublish ecosystem. **High confidence.**
- **`@modelcontextprotocol/sdk`** for the server; **stdio transport** for phase 1 (CMS MCP and Hermes co-locate on `hermes01`). Streamable-HTTP transport is deferred.
- **Typed GraphQL client via graphql-codegen** against the **vendored** `schema-v2.graphql` — the same codegen pattern the wepublish frontend uses (`framework` skill). Hand-written `.graphql` operation documents per tool; codegen emits typed functions. No arbitrary query execution path exists in the binary.
- **Env-driven connection:** `WEPUBLISH_API_URL`, `WEPUBLISH_API_TOKEN` (admin bearer/session). The admin API auth flow (challenge/OTP → JWT) is **deferred to implementation**; phase 1 accepts a pre-issued token via env so the server is testable without owning the login dance.
- **Redaction is a hard gate, centralized.** One module strips/masks secrets, payment provider keys, member PII before any value leaves a tool. Tools cannot emit raw GraphQL responses.
- **Uniform response envelope** for every tool: `{ tenant, environment, timestamp, principal, apiVersion, status, findings, redactedValues, nextChecks }` (per spec). Usable verbatim in a Linear issue and as an indexed reviewed summary.
- **Testing: vitest** (repo standard) with a mocked GraphQL transport; fixtures are typed against the vendored schema.

## Scope boundaries

In scope: the 8 read tools, typed client, redaction, envelope, audit logging, fixture-based tests, stdio server, Hermes wiring docs.

### Deferred to follow-up work
- **Write tools** (`cms_update_*`, `cms_apply_*`) — phase 2, gated (dry-run + approval + audit). Out of this plan.
- **Live-staging validation** — gated on We.Publish providing a staging endpoint + service credentials. Until then tools are fixture-verified only.
- **Admin auth flow** (challenge/OTP → JWT minting) — phase 1 takes a token via env; automating login is follow-up.
- **Streamable-HTTP transport / remote auth** — stdio is sufficient while co-located with Hermes.
- **Onboarding scaffolding helpers** (`onboarding_*`) and CMS writes — separate, later.

## Output structure

```
wepublish-cms-mcp/
├── package.json            # node22, type:module, mcp sdk, graphql, codegen, vitest
├── tsconfig.json
├── codegen.ts              # graphql-codegen config → src/generated/
├── schema/
│   └── schema-v2.graphql   # vendored from wepublish@development (refreshable)
├── scripts/
│   └── refresh-schema.sh   # re-pull schema via gh api
├── src/
│   ├── index.ts            # MCP server bootstrap + stdio transport
│   ├── config.ts           # env parsing, fail-closed validation
│   ├── client.ts           # typed GraphQL client (token, tenant header, timeout)
│   ├── redact.ts           # redaction gate
│   ├── envelope.ts         # response envelope builder + audit log
│   ├── tools/
│   │   ├── registry.ts     # allowlist of tools (no dynamic registration)
│   │   ├── get-site-profile.ts
│   │   ├── check-payment-setup.ts
│   │   ├── check-subscription-setup.ts
│   │   ├── check-member-plans.ts
│   │   ├── check-peering-status.ts
│   │   ├── check-navigation-domain-branding.ts
│   │   ├── get-setup-status.ts
│   │   └── generate-onboarding-report.ts
│   ├── operations/         # hand-written .graphql documents per tool
│   └── generated/          # codegen output (gitignored)
└── test/
    ├── fixtures/           # typed GraphQL response fixtures
    ├── helpers/mock-client.ts
    └── *.test.ts
```

---

## Implementation units

### U1. Scaffold repo + config + redaction/envelope contracts

**Goal:** A runnable, typed, tested skeleton with the security contracts present (even if tools are stubs).
**Requirements:** typed I/O, fail-closed config, audit logging foundation (spec §"Required constraints").
**Dependencies:** none.
**Files:** `package.json`, `tsconfig.json`, `src/index.ts`, `src/config.ts`, `src/redact.ts`, `src/envelope.ts`, `test/redact.test.ts`, `test/envelope.test.ts`.
**Approach:** Node22 ESM. `config.ts` parses + validates env (`WEPUBLISH_API_URL`, `WEPUBLISH_API_TOKEN`, `WEPUBLISH_TENANT`/site scope) and **throws on missing/unknown** (fail-closed). `redact.ts` exports `redact(obj, rules)` masking known-sensitive keys (token/secret/password/apiKey/stripe*/payment provider creds/email/address/phone/member PII) recursively. `envelope.ts` builds the uniform envelope and writes a structured audit line (actor, tenant, tool, timestamp, result-status) to stderr/log.
**Patterns to follow:** wepublish repo `tsconfig`/ESM conventions; vitest config style from `wepublish/labs`.
**Test scenarios:**
- redact masks nested secret keys; leaves non-sensitive scalars intact; handles arrays + null.
- redact never returns a value containing a known token prefix (`sk_`, `pk_`, `whsec_`).
- envelope includes all required fields; status defaults to `error` when findings carry an error.
- config throws on missing `WEPUBLISH_API_URL`; throws on empty token.
**Verification:** `vitest` green; `node src/index.ts` starts and responds to an MCP `list_tools` with an empty/stub registry.

### U2. Vendor schema + typed GraphQL client + transport

**Goal:** A typed, single-purpose client that can only run the hand-written operation documents.
**Requirements:** no arbitrary GraphQL; typed I/O; redaction applied at the boundary.
**Dependencies:** U1.
**Files:** `schema/schema-v2.graphql`, `scripts/refresh-schema.sh`, `codegen.ts`, `src/client.ts`, `src/operations/.gitkeep`, `test/client.test.ts`.
**Approach:** vendor `apps/api-example/schema-v2.graphql` from `wepublish@development`; `refresh-schema.sh` re-pulls via `gh api ... -H "Accept: application/vnd.github.raw"`. codegen (`@graphql-codegen/typescript` + `typescript-operations` + a typed request fn) emits `src/generated/`. `client.ts` wraps a single POST-to-`/graphql` transport: injects bearer token + tenant/site header, timeout, error normalization; exposes only the generated typed operations. No `query(string)` escape hatch.
**Patterns to follow:** wepublish frontend's `graphql-codegen` typed-hooks pattern (`framework` skill, `@wepublish/website/api`).
**Test scenarios:**
- client sends Authorization + tenant header; respects timeout (mock transport).
- client surfaces a GraphQL `errors[]` payload as a normalized error, not a throw of raw body.
- no exported symbol accepts a raw query string (type-level + grep assertion in test).
**Verification:** `codegen` runs clean against the vendored schema; `vitest` green.

### U3. MCP server + tool registry + reference tool (`cms_get_site_profile`)

**Goal:** End-to-end vertical slice establishing the tool pattern every other tool copies.
**Requirements:** allowlisted tools only; envelope output; redaction; audit.
**Dependencies:** U1, U2.
**Files:** `src/tools/registry.ts`, `src/tools/get-site-profile.ts`, `src/operations/site-profile.graphql`, `test/helpers/mock-client.ts`, `test/fixtures/site-profile.json`, `test/tools/get-site-profile.test.ts`.
**Approach:** `registry.ts` is a static allowlist (array → MCP `registerTool`); no dynamic/discovered tools. `cms_get_site_profile` runs the `peerProfile`/site-settings query (exact fields **deferred** — codegen surfaces them), maps to findings (`siteName`, `url`, `logo set?`, `theme/branding present?`), redacts, wraps in envelope. `mock-client.ts` returns fixtures keyed by operation name so tools are tested without a network.
**Execution note:** Implement test-first — write the fixture + expected envelope assertion before the mapping.
**Patterns to follow:** envelope/redact from U1; client from U2.
**Test scenarios:**
- happy path: fixture → envelope with expected findings + `status: ok`.
- missing optional field (no logo) → finding flags it, not an error.
- unknown tenant fixture → `status: error`, fail-closed, no partial leak.
- redaction: a fixture containing a payment key never appears in output.
**Verification:** `list_tools` shows exactly the registry; calling `cms_get_site_profile` against the mock returns the envelope.

### U4. Diagnostic read tools — membership group

**Goal:** `cms_check_payment_setup`, `cms_check_subscription_setup`, `cms_check_member_plans`.
**Requirements:** spec read-tool list; payment/member redaction is mandatory here.
**Dependencies:** U3.
**Files:** `src/tools/check-payment-setup.ts`, `src/tools/check-subscription-setup.ts`, `src/tools/check-member-plans.ts`, `src/operations/{payment-methods,subscriptions,member-plans}.graphql`, matching `test/fixtures/*` and `test/tools/*.test.ts`.
**Approach:** map `paymentMethods`, `memberPlans`, subscription/`activeSubscribers` admin queries → readiness findings (e.g., "≥1 active payment method", "member plans have prices + periodicities", "subscriptions configured"). Each returns "configured / incomplete / not-found" with the specific gaps. **Heavy redaction** — payment provider IDs/keys and any member PII masked.
**Execution note:** test-first; these carry the highest leak risk.
**Patterns to follow:** U3 tool shape.
**Test scenarios (per tool):**
- happy: complete config → `status: ok` + positive findings.
- incomplete: e.g., member plan missing price → flagged gap, not error.
- error path: GraphQL error → fail-closed envelope.
- redaction: provider secret / member email in fixture is absent from output (explicit assertion).
**Verification:** three tools registered + green tests; no raw provider/member values in any output.

### U5. Diagnostic read tools — distribution group

**Goal:** `cms_check_peering_status`, `cms_check_navigation_domain_branding`.
**Requirements:** spec read-tool list.
**Dependencies:** U3.
**Files:** `src/tools/check-peering-status.ts`, `src/tools/check-navigation-domain-branding.ts`, `src/operations/{peer-profile,navigations}.graphql`, fixtures + tests.
**Approach:** peering → `peerProfile`/`peers` (peer name, call-to-action, logo, enabled peers); navigation/domain/branding → `navigations` (required slugs `main`/`header`/`footer`/`icons` per `framework` skill gotchas) + site URL/branding settings. Findings flag missing required navigation slugs and absent branding.
**Patterns to follow:** U3; the navigation-slug invariant from the `framework` skill.
**Test scenarios:**
- peering happy + "no peers configured" (valid not-found, not error).
- navigation missing a required slug → flagged gap.
- error path → fail-closed.
**Verification:** two tools registered + green tests.

### U6. Composite tools — setup status + onboarding report

**Goal:** `cms_get_setup_status` and `cms_generate_onboarding_report` aggregate the atomic tools into one readiness view.
**Requirements:** spec read-tool list; output usable in a Linear issue + as an indexed reviewed summary.
**Dependencies:** U3, U4, U5.
**Files:** `src/tools/get-setup-status.ts`, `src/tools/generate-onboarding-report.ts`, `test/tools/{get-setup-status,generate-onboarding-report}.test.ts`.
**Approach:** call the atomic tool functions (not re-querying ad hoc), compose a per-area checklist (`site / payment / subscription / member-plans / peering / navigation`) with overall `ready | blockers` + an ordered `nextChecks`/required-human-actions list. `generate-onboarding-report` is the human-facing markdown-friendly rendering of the same data.
**Patterns to follow:** reuse U3–U5 tool functions; envelope from U1.
**Test scenarios:**
- all-green fixtures → `ready`, empty blockers.
- mixed fixtures → blockers list names exactly the failing areas, ordered.
- one area errors → report degrades gracefully (area marked unknown), overall not silently "ready".
**Verification:** both tools registered; aggregate matches the underlying tool outputs on shared fixtures.

### U7. Hermes integration surface + docs + deferred-validation note

**Goal:** Make the server consumable by Hermes and document the live-validation gate.
**Requirements:** Hermes is the only caller; scoped token; audit; no admin keys in client config.
**Dependencies:** U1–U6.
**Files:** `README.md`, `.env.example`, `src/index.ts` (finalize stdio wiring), `docs/hermes-integration.md`.
**Approach:** document stdio launch + env contract for Hermes; `.env.example` with `WEPUBLISH_API_URL`/`WEPUBLISH_API_TOKEN`/tenant scope (never committed). README states the **deferred live-staging validation** explicitly: tools are fixture-verified; first real run requires a staging endpoint + service token and a re-verification pass. Note the audit-log destination.
**Patterns to follow:** wp-knowledge specs' security framing.
**Test expectation:** none — docs + wiring; covered by U1–U6 behavior tests.
**Verification:** `README` documents every tool + the env contract + the validation gate; `node src/index.ts` serves all 8 tools over stdio.

---

## Risks & mitigations

- **Building blind against a vendored schema** — exact admin query field names/auth shape may differ from a live server. Mitigation: codegen against the real committed schema (not guessed types); isolate the network boundary in `client.ts`; mark field selection deferred; gate a re-verification pass on first live run.
- **Redaction miss = data leak** (highest risk). Mitigation: centralized redaction gate + per-tool explicit "secret absent from output" assertions; tools cannot emit raw responses.
- **Scope creep into writes.** Mitigation: no mutation operation documents exist in the binary; writes are a separate gated phase.
- **Admin auth complexity.** Mitigation: env-injected token in phase 1; automate login later.

## Deferred to implementation
- Exact admin GraphQL field selections per tool (codegen surfaces them).
- Admin auth/login automation (challenge/OTP → JWT).
- Tenant/site scoping header name (confirm against schema/server).
- Audit-log sink (stderr vs file vs forwarded) — pick during U1.

## Sources
- `wp-knowledge/MCP_DELIVERY_SPEC.md` (origin), `wp-knowledge/AI_SUPPORT_ARCHITECTURE_SPEC.md`.
- `wepublish/wepublish@development`: `apps/api-example/schema-v2.graphql` (admin schema, vendored), `libs/peering|membership|payment|navigation`.
- `wepublish-skills/framework/SKILL.md`: stack (NestJS + Prisma, graphql-codegen, `/graphql`), navigation-slug invariant, subscribe/member documents.
