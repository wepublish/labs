# Member Plan — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/member-plan/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
MemberPlans are the products a publisher sells: subscriptions or donations with a monthly price range, a currency, and a set of allowed payment methods/periodicities. Subscriptions, paywalls, vouchers, and crowdfundings all reference member plans.

## Key types
**MemberPlan** — sellable plan definition.
- `slug: String!` — unique, used for public lookup
- `currency: Currency!` — `CHF` or `EUR` (enum has only these two)
- `amountPerMonthMin: Int!`, `amountPerMonthMax: Int`, `amountPerMonthTarget: Int` — price range/suggestion per month
- `availablePaymentMethods: [AvailablePaymentMethod!]!` — which methods + periodicities are allowed
- `extendable: Boolean!` — whether subscriptions on this plan can be extended/renewed (Prisma default `true`)
- `maxCount: Int` — cap on number of subscriptions
- `productType: ProductType!` — `Subscription` | `Donation` (Prisma default `Subscription`)
- `migrateToTargetPaymentMethodID: String` — target payment method for plan migration
- `successPageId / failPageId / confirmationPageId: String` — checkout outcome pages
- `externalReward: String`, `tags: [String!]`, `active: Boolean!`

**AvailablePaymentMethod** — per-plan payment configuration.
- `paymentMethodIDs: [String!]!`, `paymentPeriodicities: [PaymentPeriodicity!]!`
- `forceAutoRenewal: Boolean!` — forces autoRenew for this method

**PaymentPeriodicity** (enum) — `monthly`, `quarterly`, `biannual`, `yearly`, `biennial`, `lifetime`.

**ProductType** (enum) — `Subscription`, `Donation`.

## Key queries & mutations
- `memberPlan(id, slug): MemberPlan!` — public
- `memberPlans(filter: MemberPlanFilter, take, skip, sort, order): PaginatedMemberPlans!` — public
- `createMemberPlan(...): MemberPlan!` — admin
- `updateMemberPlan(id, ...): MemberPlan!` — admin
- `deleteMemberPlan(id): MemberPlan!` — admin

## Permissions
`memberPlan` and `memberPlans` are `@Public()`. `createMemberPlan` AND `updateMemberPlan` are both gated by `CanCreateMemberPlan` (there is no separate CanUpdateMemberPlan on the resolver); `deleteMemberPlan` requires `CanDeleteMemberPlan`.

## Gotchas
- There is no trial-period field on MemberPlan; "trial-like" behaviour is modelled via `extendable: false` plans (non-renewing) and `forceAutoRenewal` on payment methods.
- Amounts are `Int` (cents) in the SDL but stored as `Float` in Prisma (`amountPerMonthMin Float`).
- `Currency` is plan-level and copied onto subscriptions and invoices; only CHF and EUR exist.
- `availablePaymentMethods` rows cascade-delete with the plan (Prisma `onDelete: Cascade`).
- `updateMemberPlan` is protected by the *create* permission constant — role setups granting create implicitly grant update.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `MemberPlan`, `AvailablePaymentMethod`, enums `Currency`, `ProductType`, `PaymentPeriodicity`)
- `libs/member-plan/api/src/lib/member-plan.resolver.ts`
