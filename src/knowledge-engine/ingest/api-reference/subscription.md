# Subscription & Invoice — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/membership/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Subscriptions bind a user to a member plan with a payment method, periodicity, and monthly amount. Billing is materialized as Invoices (with InvoiceItems) and SubscriptionPeriods; cancellation is recorded as a SubscriptionDeactivation.

## Key types
**PublicSubscription** (GraphQL name for Subscription) —
- `memberPlanID`, `paymentMethodID`, `userID: String!` — core relations
- `monthlyAmount: Int!`, `currency: Currency!`, `paymentPeriodicity: PaymentPeriodicity!`
- `autoRenew: Boolean!`, `extendable: Boolean!`, `canExtend: Boolean!` (computed)
- `startsAt: DateTime!`, `paidUntil: DateTime` — paid-up boundary
- `confirmed: Boolean!` — false for double-opt-in subscriptions awaiting confirmation (Prisma default `true`)
- `deactivation: SubscriptionDeactivation`, `isActive: Boolean!`, `periods: [SubscriptionPeriod!]!`, `url: String!`

**SubscriptionPeriod** — one billed timespan: `startsAt`, `endsAt`, `amount: Float!`, `paymentPeriodicity`, `invoiceID: String!`, `isPaid: Boolean!`.

**SubscriptionDeactivation** — `date: DateTime!`, `reason: SubscriptionDeactivationReason!` (`none`, `invoiceNotPaid`, `userSelfDeactivated`, `userReplacedSubscription`).

**Invoice** — `mail: String!` (billing email), `dueAt!`, `paidAt`, `canceledAt`, `scheduledDeactivationAt: DateTime!` (when the subscription gets deactivated if unpaid), `currency!`, `items: [InvoiceItem!]!`, `total: Int!` (computed), `subscriptionID`, `manuallySetAsPaidByUserId`.

**InvoiceItem** — `name!`, `quantity: Int!`, `amount: Int!`, `total: Int!`; can reference a Voucher in Prisma.

## Key queries & mutations
- `subscription(id)` — `CanGetSubscription`; `subscriptions(filter…)` — `CanGetSubscriptions`; `subscriptionsAsCsv(…)` — `CanGetSubscriptions` + `CanGetUsers`
- `invoice(id)` — `CanGetInvoice`; `invoices(filter…)` — `CanGetInvoices`
- `userInvoices` / `checkInvoiceStatus(id)` — authenticated user (own data); `checkInvoiceStatus` polls the payment provider and updates the invoice
- `createSubscription`, `importSubscription(skipMail)`, `renewSubscription`, `cancelSubscription(id, reason, skipMail)` — all `CanCreateSubscription`; `deleteSubscription` — `CanDeleteSubscription`
- `createInvoice`, `updateInvoice`, `markInvoiceAsPaid(id)` — `CanCreateInvoice`; `deleteInvoice` — `CanDeleteInvoice`
- Dashboard: `activeSubscribers`, `newSubscribers`, `newDeactivations`, `renewingSubscribers`, `dailySubscriptionStats`, `revenue`, `expectedRevenue` — `CanGetSubscriptions` / `CanGetInvoices`

## Permissions
Admin operations use `CanGetSubscription(s)`, `CanCreateSubscription`, `CanDeleteSubscription`, `CanGetInvoice(s)`, `CanCreateInvoice`, `CanDeleteInvoice`. `userInvoices`/`checkInvoiceStatus` use `@Authenticated()`. Self-service flows live in `user-subscription` (see subscription-flows/user docs).

## Gotchas
- `cancelSubscription`, `importSubscription`, and `createUser` accept `skipMail: Boolean` to suppress automation emails during bulk migrations.
- `markInvoiceAsPaid` and `updateInvoice` are gated by the *create* permission (`CanCreateInvoice`), not a separate update constant.
- Prisma `Subscription.replacesSubscriptionID` tracks upgrade/replacement history (`ReplacementHistory` relation) — not exposed as an SDL field, but surfaces as `userReplacedSubscription` deactivations.
- Deactivation is 1:1 (`subscriptionID @unique`); re-activating mutations (`updateUserSubscription`) reset it to null.
- `revenue` dashboard query excludes manually-set-as-paid invoices; `expectedRevenue` excludes canceled ones.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma`
- `libs/membership/api/src/lib/{subscription,invoice,dashboard}/`
