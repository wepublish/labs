# We.Publish API — domain overview

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql` (~400 type definitions), `libs/api/prisma/schema.prisma` (76 models)
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

One line per domain as exposed by the generated v2 GraphQL SDL. Each domain lives in `libs/<domain>/api/src/` (NestJS code-first resolvers); the SDL is the generated ground truth.

## Where the schema lives
- **GraphQL SDL (generated):** `apps/api-example/schema-v2.graphql`
- **Database schema:** `libs/api/prisma/schema.prisma`
- **Permission constants:** `libs/permissions/src/lib/permissions.ts` (`Can*`), applied via `@Permissions(...)`; ungated reader operations are `@Public()`, session-only ones `@Authenticated()`.

**Rule:** raw schema/SDL text is NOT stored in this KB. Look it up live via the Developer Context MCP against the repo; these reference docs only summarize and point at paths.

## Content
- **Article** — articles with draft/pending/published revisions, blocks, SEO/social fields, likes; `articles`, `createArticle`, `publishArticle`...
- **Page** — static pages, same revision/block machinery; `page(s)`, `createPage`...
- **Author** — author profiles with links, bio, tags; `author(s)`.
- **Block content** (`block-content`) — the `BlockContent` union (~30 block types: text, media, embeds, teasers, poll/event/comment/crowdfunding blocks) + `BlockStyle` records (`blockStyles`).
- **Comment** — threaded comments with revisions, states, rating system (`ratingSystem`), tags, guest commenting; `comments`, `commentsForItem`.
- **Tag** — typed labels for articles/pages/authors/events/comments → `tag.md`.
- **Event** — calendar events + external agenda imports → `event.md`.
- **Poll** — reader polls, votes, external vote sources → `poll.md`.
- **Image** — image library with focal point, license fields; `image(s)`, `uploadImage`, `getImagesByTag`.
- **Navigation** — menus of page/article/external links; `navigation(s)`.
- **Phrase** — full-text search over article/page titles and blocks (`phrase` query).
- **Document** — document storage (`documents`, `documentStorageUsage`).
- **Peering** — content exchange between We.Publish instances: `peer(s)`, `peerProfile`, `remotePeerProfile`, `peerArticles`.
- **Hot & trending** — `hotAndTrending` article ranking (analytics-provider backed).

## Monetization
- **MemberPlan** — membership products with payment-method bindings; `memberPlan(s)`.
- **Subscription** (`user-subscription`, `membership`) — subscriptions, deactivation, trials; `subscriptions`, `subscriptionsAsCsv`, `userSubscriptions`, `upgradeUserSubscriptionInfo`, `createSubscriptionInfo`.
- **Subscription flows** (mail automation) — `subscriptionFlows`, `createSubscriptionInterval`, `systemMails`, `mailTemplates` + placeholders.
- **Invoice** — invoices and payment state; `invoice(s)`, `userInvoices`, `checkInvoiceStatus`.
- **Payment** — `paymentMethod(s)`, `paymentProviders`, payment provider settings (Stripe, Payrexx, Mollie, Bexio).
- **Voucher** — `voucher(s)` redemption codes.
- **Crowdfunding** — campaigns with goals and progress; `crowdfunding(s)` + `CrowdfundingBlock`.
- **Paywall** — paywall definitions and bypasses; `paywall(s)`.
- **Stats** — `stats`, `dailySubscriptionStats`, `revenue`, `expectedRevenue`, `newSubscribers`, `activeSubscribers`, `renewingSubscribers`, `newDeactivations` (each can be made public via `MAKE_*_API_PUBLIC` settings).
- **Mailchimp sync** — `mailchimpLists/InterestGroups/MergeFields`, `mailchimpSyncProgress/Errors` (sync provider settings).

## Audience
- **User** — readers/members CRUD, `me`, `users`, password & OAuth flows.
- **UserRole / permissions** — RBAC: `userRole(s)`, `permissions` query, `Can*` constants.
- **Session / authentication** — `tokens`, `challenge` (captcha), `checkLoginOtp`, login JWT mutations, TOTP check.
- **Consent** — consent definitions + per-user decisions → `consent.md`.
- **Banner** — targeted on-site banners → `banner.md`.
- **Mail** — mail provider settings, `provider` query, test mails.
- **Action** — `actions` dashboard activity feed (recent articles/pages/comments/polls/events/users/subscriptions created).

## System
- **Settings** — public KV feature flags + gated provider settings (mail, payment, analytics, challenge, sync, tracking pixel, AI) → `settings.md`.
- **External apps** — editor-embedded third-party tools + JWT handshake → `external-apps-and-ai.md`.
- **AI** — v0 (Vercel) HTML generation via `promptHTML` → `external-apps-and-ai.md`.
- **Analytics / tracking pixel** — Google Analytics provider, ProLitteris tracking pixels.
- **Jobs / ops** — `periodicJobLog`, `versionInformation`, health endpoints (`libs/health`).

## Related KB pages
`event.md`, `poll.md`, `tag.md`, `settings.md`, `consent.md`, `banner.md`, `external-apps-and-ai.md` in this directory.
