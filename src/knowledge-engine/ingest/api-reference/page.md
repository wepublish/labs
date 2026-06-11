# Page — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/page/api/src/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Pages are static/structural content (front page, sections, about, member-plan landing pages) built from the same block system as articles. Like Article, a `Page` is a container whose content lives in `PageRevision` records with draft/pending/published slots.

## Key types
**Page** — container with revision slots.
- `draft / pending / published: PageRevision` — nullable revision slots
- `latest: PageRevision!` — resolves per preview mode
- `slug: String` — nullable
- `hidden: Boolean!`
- `publishedAt: DateTime` — nullable
- `url: String!`, `previewUrl: String!`
- `tags: [Tag!]!`

**PageRevision** — one content snapshot.
- `blocks: [BlockContent!]!` — same block union as articles (JSON in Prisma)
- `title: String`, `description: String` — both nullable (no preTitle/lead/seoTitle like articles)
- `properties: [Property!]!` — key/value metadata
- `image: Image`, `socialMediaTitle/Description: String`, `socialMediaImage: Image`
- `publishedAt: DateTime`

**PageFilter** (input) — `title`, `description`, `draft/pending/published: Boolean`, `includeHidden`, `tags`, `publicationDateFrom/To`.

**PageSort** enum — `CreatedAt | ModifiedAt | PublishedAt`.

## Key queries & mutations
- `page(id, slug): Page!` — public
- `pages(filter, sort: PageSort = PublishedAt, take, skip, cursorId): PaginatedPages!` — public
- `createPage(blocks, title, description, slug, hidden, imageID, properties, tagIds, socialMedia…)` — admin
- `updatePage(id, …same fields…)` — admin
- `duplicatePage(id): Page!` — admin
- `publishPage(id, publishedAt: DateTime!)` / `unpublishPage(id)` — admin
- `deletePage(id): String!` — admin

## Permissions
`@Public()`: `page`, `pages`. Gated: `createPage`, `updatePage`, `duplicatePage` → `CanCreatePage`; `deletePage` → `CanDeletePage`; `publishPage`, `unpublishPage` → `CanPublishPage`; `draft`/`pending` resolve fields → `CanGetPage`.

## Gotchas
- Pages have no authors, no paywall, no peer fields, no comments toggle — those are Article-only. Page metadata is just title + description.
- Same scheduled-publish model as articles: Prisma views `pages.revisions.draft/pending/published` back the three slots; `publishPage` with a future date lands in `pending`.
- `updatePage` requires `CanCreatePage` — there is no separate update permission.
- MemberPlans reference pages as success/fail/confirmation pages (Prisma relations `successPage`/`failPage`/`confirmationPage`), so deleting a landing page can affect membership flows.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (Page, PageRevision, PagesRevision* views)
- `libs/page/api/src/lib/page.resolver.ts`, `page-revision.resolver.ts`
