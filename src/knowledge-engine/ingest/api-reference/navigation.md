# Navigation — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/navigation/api/src/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Navigations are named, keyed menus (header, footer, etc.) rendered by the website. Each navigation holds an ordered list of links that point to an article, a page, or an external URL.

## Key types
**Navigation**
- `key: String!` — unique machine key (Prisma `@unique`); how frontends look menus up
- `name: String!` — display name
- `links: [BaseNavigationLink!]!` — polymorphic link list

**BaseNavigationLink** (interface) — `id!`, `label: String!`, `type: NavigationLinkType!`, `createdAt`, `modifiedAt`. Implementations:
- **ArticleNavigationLink** — `article: Article!`, `articleID: String!`
- **PageNavigationLink** — `page: Page!`, `pageID: String!`
- **ExternalNavigationLink** — `url: String` (nullable)

**NavigationLinkType** enum — `Article | External | Page`.

**NavigationLinkInput** — flat input: `label!`, `type: String!`, plus whichever of `articleID` / `pageID` / `url` matches the type.

## Key queries & mutations
- `navigation(id): Navigation!` — public
- `navigations: [Navigation!]!` — public (no pagination/filter)
- `createNavigation(key!, name!, links!): Navigation!` — admin
- `updateNavigation(id!, key!, name!, links!): Navigation!` — admin; all args required, links replaced wholesale
- `deleteNavigation(id): Navigation!` — admin

## Permissions
`@Public()`: `navigation`, `navigations`. Gated: `createNavigation` and `updateNavigation` → `CanCreateNavigation`; `deleteNavigation` → `CanDeleteNavigation` (`libs/navigation/api/src/lib/navigation.resolver.ts`).

## Gotchas
- `navigation(id)` only takes an `id` — there is no lookup by `key` in the SDL, despite `key` being the unique handle; clients fetch `navigations` and filter client-side or know the id.
- `updateNavigation` requires the full payload (`key`, `name`, `links` all non-null) — it is a replace, not a patch; partial updates will drop links.
- `NavigationLinkInput.type` is a plain `String!`, not the `NavigationLinkType` enum, and Prisma stores `type` as `String` too — typos are not schema-validated.
- Deleting an article or page cascades onto its navigation links (Prisma `onDelete: Cascade` on `NavigationLink.article/page`), silently shrinking menus.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (Navigation, NavigationLink)
- `libs/navigation/api/src/lib/navigation.resolver.ts`, `navigation.model.ts`
