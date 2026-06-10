# Staging & service token

How to run the CMS MCP against a real We.Publish API and mint the token it needs.
Everything here uses **We.Publish's own dev stack** — nothing bespoke to maintain.

## 1. Bring up the API (their standard dev flow)

In a `wepublish/wepublish` checkout (`.ai/development.md`):

```bash
npm i
npm run start:docker      # Postgres + MinIO
npm run migrate           # Prisma migrations + seed
npm run watch:api-example # API (GraphQL) at http://localhost:4000/v1
```

Optionally `npm run watch:editor` (CMS UI at :3000) to create payment methods,
member plans, navigations, peers for realistic data.

## 2. Mint a service token — and the permission gap (IMPORTANT)

The MCP authenticates as a **peer/service session**: a long-lived token sent with
`Authorization: Bearer <token>` **and** `User-Agent: We.Publish/1.0 Peering`
(`libs/authentication/api/src/lib/session.strategy.ts`). A token's permissions come
from its `roleIDs` (`getPeerSession`).

**The gap:** the public `createToken` mutation only accepts a `name`
(`CreateTokenInput = PickType(TokenWithSecret, ['name'])`) and never sets `roleIDs`;
there is no `updateToken` mutation and no editor UI for token roles. So a token
minted the supported way has **zero permissions**, and every `@Permissions`-gated
read (`paymentMethods`, `subscriptions`, settings) returns forbidden. `memberPlans`,
`navigations`, `peerProfile` are `@Public()` and work regardless.

**Two ways to give the token the three read permissions it needs**
(`CanGetPaymentMethods`, `CanGetSubscriptions`, `CanGetSettings`):

- **Preferred — land the upstream PR** that adds `roleIDs` to
  `CreateTokenInput`/`UpdateTokenInput` + an editor role-picker, then create a
  **scoped read-only role** (only those three perms — *not* `admin`) and assign it.
  (PR prepared separately; see the architecture/handoff plan.)
- **Interim/dev only — set it directly in Postgres** after `createToken`:
  ```sql
  -- create a role carrying the three CanGet* perms, then:
  UPDATE tokens SET role_ids = '{<scoped-role-id>}' WHERE name = '<token-name>';
  ```
  This is a documented stopgap, not a maintainable production path.

## 3. Point the MCP at it

```bash
export WEPUBLISH_API_URL=http://localhost:4000/v1
export WEPUBLISH_API_TOKEN=<the token string>
export WEPUBLISH_TENANT=dev
npm run dev            # stdio
# or, HTTP:
export MCP_AUTH_TOKEN=<any secret for the /mcp endpoint>
npm run dev:http       # http://localhost:3000/mcp
```

## 4. Validate

Call each tool (via an MCP client or the HTTP smoke). Confirm:
- `cms_get_site_profile`, `cms_check_member_plans`, `cms_check_navigation_domain_branding` work on a name-only token (public queries).
- `cms_check_payment_setup`, `cms_check_subscription_setup` return data **only** once the token has the read role (step 2); otherwise they fail closed with a forbidden error.
- `cms_get_setup_status` / `cms_generate_onboarding_report` aggregate correctly.

Record any field-selection drift vs the live schema; refresh with
`./scripts/refresh-schema.sh && npm run codegen && npm test`.
