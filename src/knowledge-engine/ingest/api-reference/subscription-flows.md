# Subscription Flows — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/membership/api/src/lib/subscription-flow/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Subscription flows are the communication automation layer: per member plan (or a default flow), they map subscription lifecycle events to mail templates, with optional day offsets relative to the subscription end. A periodic job evaluates intervals and dispatches the mails.

## Key types
**SubscriptionFlowModel** —
- `default: Boolean!` — exactly one fallback flow when no plan-specific flow matches
- `memberPlan: MemberPlan` — null for the default flow
- `paymentMethods: [PaymentMethod!]!`, `periodicities: [PaymentPeriodicity!]!`, `autoRenewal: [Boolean!]!` — matching criteria deciding which subscriptions the flow applies to
- `intervals: [SubscriptionInterval!]!` — the event→mail rules
- `numberOfSubscriptions: Int!` — computed count of matching subscriptions

**SubscriptionInterval** —
- `event: SubscriptionEvent!` — `SUBSCRIBE`, `CONFIRM_SUBSCRIPTION`, `INVOICE_CREATION`, `RENEWAL_SUCCESS`, `RENEWAL_FAILED`, `DEACTIVATION_UNPAID`, `DEACTIVATION_BY_USER`, `CUSTOM`
- `daysAwayFromEnding: Int` — offset relative to subscription end (negative = before); nullable for instant events; Prisma `@db.SmallInt`
- `mailTemplate: MailTemplateRef` — template to send (nullable = no mail)

**SystemMailModel** (sibling automation for user-level events) — `event: UserEvent!`, `mailTemplate: MailTemplateRef` (see mail.md).

## Key queries & mutations
- `subscriptionFlows(defaultFlowOnly: Boolean!, memberPlanId): [SubscriptionFlowModel!]!` — `CanGetSubscriptionFlows`
- `createSubscriptionFlow(memberPlanId!, paymentMethodIds!, periodicities!, autoRenewal!)` — `CanCreateSubscriptionFlow`
- `updateSubscriptionFlow(id!, …)` — `CanUpdateSubscriptionFlow`; `deleteSubscriptionFlow(id!)` — `CanDeleteSubscriptionFlow`
- `createSubscriptionInterval(subscriptionFlowId!, event!, daysAwayFromEnding, mailTemplateId)` — `CanCreateSubscriptionFlow` + `CanUpdateSubscriptionFlow`
- `updateSubscriptionInterval(id!, daysAwayFromEnding, mailTemplateId)` / `deleteSubscriptionInterval(id!)` — `CanUpdateSubscriptionFlow`
- `periodicJobLog(skip, take)` — `CanGetPeriodicJobLog` — execution log of the daily job that runs the flows

## Permissions
All gated: `CanGetSubscriptionFlows`, `CanCreateSubscriptionFlow`, `CanUpdateSubscriptionFlow`, `CanDeleteSubscriptionFlow`, `CanGetPeriodicJobLog` (`libs/membership/api/src/lib/subscription-flow/subscription-flow.resolver.ts`). No public access.

## Gotchas
- Every flow/interval mutation returns the *entire* `[SubscriptionFlowModel!]!` list, not the touched record — the editor re-renders the whole table from one response.
- The Prisma table is named `subscription_communication_flows`; intervals live in `subscriptions.intervals`.
- A flow matches a subscription on the triple (paymentMethod, periodicity, autoRenewal); plan-specific flows shadow the `default` flow.
- `deleteSubscriptionFlow` of the default flow is the dangerous case — the default is the only flow guaranteed to exist for unmatched subscriptions.
- Mail templates are referenced by internal id but resolved against the mail provider via `externalMailTemplateId` (see mail.md) — a deleted remote template shows `remoteMissing: true` but the interval keeps pointing at it.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `SubscriptionFlow`, `SubscriptionInterval`, `PeriodicJob`, enum `SubscriptionEvent`)
- `libs/membership/api/src/lib/subscription-flow/subscription-flow.resolver.ts`, `libs/membership/api/src/lib/periodic-job/periodic-job.resolver.ts`
