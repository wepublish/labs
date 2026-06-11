# Banner — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/banner/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Site banners (membership appeals, announcements) shown on articles and pages, with targeting by login/subscription status, per-page placement, display delay and per-user snooze. Each banner carries a list of action buttons.

## Key types
- **Banner**
  - `title: String!`, `text: String!`, `cta: String`, `html: String` — content (html allows raw markup)
  - `image: Image` / `imageId: String`
  - `active: Boolean!` — toggle
  - `showOnArticles: Boolean!`, `showOnPages: [PageModel!]` — placement (PageModel is just `{ id }`)
  - `showForLoginStatus: LoginStatus!` — audience targeting
  - `delay: Int!` — seconds-style delay before showing; `hideForMinutes: Int!` — snooze after dismissal (Prisma default 1440)
  - `collapsible: Boolean!`
  - `actions: [BannerAction!]`
- **BannerAction** — `label: String!`, `url: String!`, `style: String!`, `role: BannerActionRole!`
- **BannerActionRole** (enum) — `PRIMARY | CANCEL | OTHER`
- **LoginStatus** (enum) — `ALL | LOGGED_IN | LOGGED_OUT | SUBSCRIBED | UNSUBSCRIBED | PAYWALL_BYPASSED`
- **BannerDocumentType** (enum) — `ARTICLE | PAGE`
- Inputs: `CreateBannerInput`, `UpdateBannerInput` (full replace incl. `actions: [CreateBannerActionInput!]`)

## Key queries & mutations
- `primaryBanner(documentId, documentType, loggedIn, hasSubscription, hasPaywallBypass): Banner` — **public**; the website asks "which banner should this reader see on this document" and passes the reader's status flags.
- `banners(skip!, take!): [Banner!]!`, `banner(id): Banner!` — admin
- `createBanner(input)`, `updateBanner(input)`, `deleteBanner(id): Boolean` — admin

## Permissions
- `primaryBanner`: `@Public()`
- `banners` / `banner`: `CanGetBanner`; `createBanner`: `CanCreateBanner`; `updateBanner`: `CanUpdateBanner`; `deleteBanner`: `CanDeleteBanner`

## Gotchas
- Audience targeting is client-asserted: `primaryBanner` trusts the `loggedIn` / `hasSubscription` / `hasPaywallBypass` arguments the frontend sends; it does not derive them from the session.
- `UpdateBannerInput` requires nearly all fields (`active`, `delay`, `hideForMinutes`, `text`, `title`, ... are non-null) — it is a replace, not a patch; action lists are recreated from `CreateBannerActionInput`.
- `deleteBanner` returns nullable `Boolean` (effectively void), unlike most delete mutations that return the deleted entity.
- `banners` pagination args `skip`/`take` are required (no defaults), unlike most paginated queries in this API.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `Banner`, `BannerAction`, enum `LoginStatus`)
- `libs/banner/api/src/lib/banner.resolver.ts`
