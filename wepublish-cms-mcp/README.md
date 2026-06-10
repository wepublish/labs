# wepublish-cms-mcp

Read-only [MCP](https://modelcontextprotocol.io) server exposing **curated diagnostic tools** over the We.Publish **admin** GraphQL API (`/v1`). It answers "is this newsroom's setup/payment/subscription/peering/branding correct right now?" — the live tenant state a knowledge base can't provide.

> **Where this lives:** currently a self-contained subdirectory in `wepublish/labs` (the AI-experiments repo). The `.github/workflows/`, `Dockerfile`, `LICENSE`, and `CODEOWNERS` here **activate when this directory is promoted to its own repo** (e.g. `wepublish/wepublish-cms-mcp`) — GitHub Actions only runs workflows at a repo root. It sits alongside the existing public **`wepublish-mcp`** (developer/docs context) and **`wepublish-ai-support-agent`** as a third MCP surface.

## Status

Phase 1 — **read-only**, built and unit-tested against the **vendored schema + mocked fixtures** (53 tests). **Not yet run against a live server** — see `docs/staging-and-token.md` for validation. Writes are a separate, gated phase (not here).

## Tools (8)

Each is scoped to one newsroom (`newsroom` arg selects a configured upstream, or the default) and returns a uniform envelope: `{ tenant, environment, timestamp, principal, apiVersion, status, findings, redactedValues, nextChecks }` with `status ∈ ok | incomplete | not_found | error`.

| Tool | Reports | Auth |
|---|---|---|
| `cms_get_site_profile` | name, website/host URL, theme, logo/CTA set | public |
| `cms_check_member_plans` | plans: price + payment-method completeness | public |
| `cms_check_navigation_domain_branding` | required navs (main/header/footer/icons), domain, branding | public |
| `cms_check_peering_status` | enabled peers (peer tokens never read) | public |
| `cms_check_payment_setup` | payment methods + ≥1 active (provider secrets never read) | **needs read role** |
| `cms_check_subscription_setup` | subscription + active-subscriber counts (no PII) | **needs read role** |
| `cms_get_setup_status` | aggregate `ready \| blockers` + ordered actions | mixed |
| `cms_generate_onboarding_report` | markdown launch-readiness report (Linear / KB) | mixed |

## How it talks to We.Publish (verified against source)

- **One endpoint at `/v1`** (merged public+admin schema; per-resolver `@Public()`/`@Permissions()`).
- **Headless auth = long-lived token** sent as `Authorization: Bearer <token>` **+ `User-Agent: We.Publish/1.0 Peering`** (the peer-session path). The token's `roleIDs` must carry `CanGetPaymentMethods`/`CanGetSubscriptions`/`CanGetSettings` for the gated tools — see the permission gap in `docs/staging-and-token.md`.
- **Tenancy is per-deployment** (one API+DB per newsroom; **no tenant header**). So this server is configured with one upstream (single mode) or several (`WEPUBLISH_UPSTREAMS`); the `newsroom` arg only selects a **configured** upstream — never an arbitrary URL/token.

## Security model

- **No arbitrary GraphQL** — tools call only the generated typed SDK (one method per hand-written operation); no `request(string)` path exists.
- **Redaction gate** (`src/redact.ts`) masks secrets/payment creds/member PII; the envelope runs every output through it. Secret-bearing types (`paymentProviderSettings`, `Peer.token`) are never selected.
- **Fail closed** on missing config / unknown newsroom / API error.
- **HTTP mode requires `MCP_AUTH_TOKEN`** (refuses to boot without it) and must be deployed **internal-only** (Service/NetworkPolicy) — never on the public `mcp.wepublish.cloud` surface.
- **Audit**: a JSON line per call to stderr (actor, newsroom, tool, status).

## Run

```bash
npm install
npm run codegen      # typed SDK from schema/schema-v2.graphql (also on pretest/prebuild)
npm test             # vitest (53)
npm run typecheck
npm run build        # -> dist/

# stdio (local / co-located agent):
cp .env.example .env # fill WEPUBLISH_API_URL=…/v1 + WEPUBLISH_API_TOKEN
npm start

# HTTP (deployable; MCP_AUTH_TOKEN required):
MCP_AUTH_TOKEN=… npm run start:http   # GET /healthz, POST /mcp
```

Docs: `docs/staging-and-token.md` (validate against the real dev stack + mint the token), `docs/hermes-integration.md` (consume from an agent), `docs/repo-home-and-staging.md` (topology decisions).

## Schema

Vendored at `schema/schema-v2.graphql` from `wepublish/wepublish@development:apps/api-example/schema-v2.graphql`. Refresh + re-verify:

```bash
./scripts/refresh-schema.sh && npm run codegen && npm test
```
