# Paywall — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/paywall/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Paywalls gate article content behind a subscription to specific member plans (or any plan). They carry display copy, rendering hints (fadeout, hide-after-N-blocks), and bypass tokens that let specific visitors skip the wall.

## Key types
**Paywall** —
- `active: Boolean!` (Prisma default true)
- `anyMemberPlan: Boolean!` — if true, any active subscription unlocks; else only `memberPlans: [MemberPlan!]!`
- `hideContentAfter: Int!` — number of blocks shown before gating (Prisma default 3)
- `fadeout: Boolean!` — fade the cut-off content (default true)
- `description / upgradeDescription / circumventDescription / upgradeCircumventDescription: RichText` — copy for new-subscriber vs upgrade vs bypass states
- `alternativeSubscribeUrl: String`, `bypasses: [PaywallBypass!]!`

**PaywallBypass** — `token: String!`, `paywallId: String!`; unique per `(paywallId, token)` in Prisma.

**Article** implements `HasOptionalPaywall` — `paywall: Paywall`, `paywallId: String`; set via `createArticle`/`updateArticle` `paywallId` arg.

**LoginStatus** (enum, used by Banners) includes `PAYWALL_BYPASSED`; `primaryBanner(..., hasPaywallBypass: Boolean!, hasSubscription: Boolean!, loggedIn: Boolean!)` targets banner display by paywall state.

## Key queries & mutations
- `paywall(id): Paywall!` — public
- `paywalls: [Paywall!]!` — public
- `createPaywall(active, anyMemberPlan, bypassTokens: [String!]!, memberPlanIds: [String!]!, hideContentAfter, fadeout, …): Paywall!` — admin
- `updatePaywall(id, …): Paywall!` — admin
- `deletePaywall(id): Paywall!` — admin

## Permissions
`paywall` and `paywalls` are `@Public()`. Mutations: `CanCreatePaywall`, `CanUpdatePaywall`, `CanDeletePaywall` (`libs/paywall/api/src/lib/paywall.resolver.ts`).

## Gotchas
- Enforcement is client-side: the article query still returns all blocks; `hideContentAfter` and `fadeout` are rendering instructions for the website frontend, not server-side truncation.
- Bypass tokens are readable through the public `paywalls` query (`Paywall.bypasses` → `PaywallBypass.token` has no auth guard) — treat bypass tokens as low-security links, not secrets.
- On `updatePaywall`, the service deletes bypasses whose tokens are *not in* the submitted `bypassTokens` list and creates the new ones — the list is a full replacement.
- The `NEW_ARTICLE_PAYWALL` Setting (SettingName enum) controls the default paywall applied to newly created articles.
- Member-plan linkage is a join table `PaywallMemberplan` (`paywalls.memberPlans`) with cascade delete on both sides.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `Paywall`, `PaywallMemberplan`, `PaywallBypass`)
- `libs/paywall/api/src/lib/paywall.resolver.ts`, `libs/paywall/api/src/lib/paywall.service.ts`
