# Payment — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/payment/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
The payment domain turns invoices into charges via pluggable payment providers. A PaymentMethod is the publisher-configured front (slug, grace period) over a PaymentProvider adapter; a Payment tracks one charge attempt and its provider intent.

## Key types
**Payment** — one charge attempt.
- `intentSecret: String!` — provider client secret / redirect URL handed to the frontend
- `state: PaymentState!` — `created`, `submitted`, `requiresUserAction`, `processing`, `paid`, `canceled`, `declined`
- `paymentMethodID: String!`; Prisma also stores `invoiceID`, `intentID`, `intentData`, `paymentData` (not in SDL)

**PaymentMethod** — publisher-facing method config: `slug: Slug!`, `active: Boolean!`, `gracePeriod: Int!` (days, Prisma default 0), `paymentProviderID: String!`, `description: String!`.

**PaymentProvider** — `id: String!`, `name: String` — runtime-registered adapter.

**PaymentProviderType** (enum) — `STRIPE`, `STRIPE_CHECKOUT`, `PAYREXX`, `PAYREXX_SUBSCRIPTION`, `MOLLIE`, `BEXIO`, `NO_CHARGE`. Implementations: `stripe-payment-provider.ts`, `stripe-checkout-payment-provider.ts`, `payrexx-payment-provider.ts`, `payrexx-subscription-payment-provider.ts`, `mollie-payment-provider.ts`, `bexio/bexio-payment-provider.ts`, `never-charge-payment-provider.ts`.

**SettingPaymentProvider** — per-provider config exposed via settings API; includes `stripe_methods: [StripePaymentMethod!]`, `payrexx_psp/payrexx_pm/payrexx_vatrate`, `mollie_methods/mollie_apiBaseUrl`, extensive `bexio_*` invoice-template fields, `offSessionPayments: Boolean`, `webhookEndpointSecret` (input-only).

**Method enums** — `StripePaymentMethod` (CARD, SEPA_DEBIT, KLARNA, …), `PayrexxPM` (TWINT, POST_FINANCE_PAY, …), `PayrexxPSP`, `PaymentMethodMollie` (CREDITCARD, IDEAL, TWINT, …).

## Key queries & mutations
- `paymentMethod(id)` — `CanGetPaymentMethod`; `paymentMethods` / `paymentProviders` — `CanGetPaymentMethods`
- `createPaymentMethod(...)` / `updatePaymentMethod(...)` — `CanCreatePaymentMethod` (both); `deletePaymentMethod(id)` — `CanDeletePaymentMethod`
- `createPaymentFromInvoice(input: PaymentFromInvoiceInput!)` — `@Authenticated()`, charges one of the user's invoices
- `createPaymentFromSubscription(subscriptionId, successURL, failureURL)` — `@Authenticated()`
- `paymentProviderSetting(s)` / `updatePaymentProviderSetting(...)` — settings module (admin)
- Webhooks: HTTP controller (not GraphQL) at `payment-webhooks/:providerId`, `@Public()`, accepts all verbs.

## Permissions
Constants in resolvers: `CanGetPaymentMethod`, `CanGetPaymentMethods`, `CanCreatePaymentMethod`, `CanDeletePaymentMethod`. Payment creation mutations are `@Authenticated()` (any logged-in user, own invoices/subscriptions). Webhook controller is `@Public()`.

## Gotchas
- `Payment` carries no amount — money lives on the Invoice/InvoiceItems; the payment only references `invoiceID` (Prisma) and tracks intent state.
- `updatePaymentMethod` is gated by `CanCreatePaymentMethod`; there is no separate update constant.
- BEXIO is a payment provider type but works invoice-based (Bexio invoice templates, `bexio_markInvoiceAsOpen`) rather than card-intent based.
- `NO_CHARGE` / `never-charge-payment-provider.ts` exists for free or externally-settled plans.
- `gracePeriod` on PaymentMethod (days) drives how long after `dueAt` an unpaid invoice is tolerated before deactivation.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `Payment`, `PaymentMethod`, `SettingPaymentProvider`, enums `PaymentState`, `PaymentProviderType`)
- `libs/payment/api/src/lib/payments.resolver.ts`, `libs/payment/api/src/lib/payment-method/payment-method.resolver.ts`, `libs/payment/api/src/lib/payment.webhook.ts`, `libs/payment/api/src/lib/payment-provider/`
