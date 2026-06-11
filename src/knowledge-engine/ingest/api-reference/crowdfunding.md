# Crowdfunding — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/crowdfunding/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Crowdfundings are fundraising campaigns with staged goals, counted either in revenue or in subscription count. Progress is computed from subscriptions on the member plans linked to the campaign within an optional date window, and rendered on the website through a CrowdfundingBlock.

## Key types
**Crowdfunding** —
- `name: String!`, `goalType: CrowdfundingGoalType!` — `Revenue` | `Subscription` (Prisma default `Revenue`)
- `memberPlans: [MemberPlan!]!` — many-to-many; subscriptions to these plans count toward the campaign
- `countSubscriptionsFrom / countSubscriptionsUntil: DateTime` — counting window
- `additionalRevenue: Float` — manual offset added to computed revenue (offline donations etc.)
- `revenue: Float`, `subscriptions: Int` — computed totals
- `activeGoal: CrowdfundingGoalWithProgress` — current goal incl. `progress: Float`
- `goals: [CrowdfundingGoal!]!`

**CrowdfundingGoal** (implements `BaseCrowdfundingGoal`) — `title: String!`, `amount: Float!`, `description: String`. `CrowdfundingGoalWithProgress` adds `progress: Float`.

**CrowdfundingBlock** (content block, implements `HasOptionalCrowdfunding`) — `crowdfundingId: String`, `crowdfunding: Crowdfunding`; member of the `BlockContent` union, so it can be embedded in articles and pages.

**Inputs** — `CreateCrowdfundingInput`, `UpdateCrowdfundingInput`, `CreateCrowdfundingGoalInput`, `CreateCrowdfundingMemberPlan` (`{id}` only).

## Key queries & mutations
- `crowdfunding(id): Crowdfunding!` — `CanGetCrowdfunding`
- `crowdfundings: [Crowdfunding!]!` — `CanGetCrowdfundings`
- `createCrowdfunding(input: CreateCrowdfundingInput!)` — `CanCreateCrowdfunding`
- `updateCrowdfunding(input: UpdateCrowdfundingInput!)` — `CanUpdateCrowdfunding`
- `deleteCrowdfunding(id): Boolean` — `CanDeleteCrowdfunding`

## Permissions
All five resolver operations are `@Permissions(...)`-gated (`libs/crowdfunding/api/src/lib/crowdfunding.resolver.ts`); none are `@Public()`. Public visitors see crowdfunding data only through `CrowdfundingBlock` inside published article/page content.

## Gotchas
- Direct `crowdfunding`/`crowdfundings` queries are admin-only, yet the same data (including computed `revenue`/`progress`) ships publicly whenever a CrowdfundingBlock is placed in published content — don't put internal numbers in goal descriptions.
- `goals[].amount` and `additionalRevenue` are `Int` in Prisma but `Float` in the SDL.
- Goals cascade-delete with their crowdfunding (Prisma `onDelete: Cascade`).
- The member-plan link is the *only* coupling to money: a campaign with no linked plans always computes zero, regardless of `goalType`.
- `goalType: Subscription` counts subscription rows, not unique users; the date window (`countSubscriptionsFrom/Until`) bounds which subscriptions count.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `Crowdfunding`, `CrowdfundingGoal`, enum `CrowdfundingGoalType`)
- `libs/crowdfunding/api/src/lib/crowdfunding.resolver.ts`
