# Article — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/article/api/src/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Articles are the core editorial content type. An `Article` is a thin container (slug, tags, peer linkage, paywall, likes) whose actual content lives in `ArticleRevision` records; the revision occupying the draft/pending/published slot determines what readers see.

## Key types
**Article** — container with revision slots and metadata.
- `draft: ArticleRevision` / `pending: ArticleRevision` / `published: ArticleRevision` — the three revision slots; all nullable
- `latest: ArticleRevision!` — resolves per preview mode (published for normal requests)
- `slug: String` — nullable
- `shared: Boolean!` — whether the article is offered to peers
- `hidden: Boolean!`, `disableComments: Boolean!`, `likes: Int!`
- `peer: Peer`, `peerId: String`, `peerArticleId: String` — set when imported from a peer
- `paywall: Paywall`, `paywallId: String`
- `url: String!`, `previewUrl: String!`
- `tags: [Tag!]!`, `trackingPixels: [TrackingPixel!]!`

**ArticleRevision** — one immutable content snapshot.
- `blocks: [BlockContent!]!` — the block content (stored as JSON in Prisma)
- `authors: [Author!]!`, `socialMediaAuthors: [Author!]!`, `hideAuthor: Boolean!`
- `preTitle / title / lead / seoTitle: String` — all nullable
- `breaking: Boolean!`, `canonicalUrl: String`, `properties: [Property!]!`
- `image: Image`, `socialMediaImage/Title/Description` — SEO/social fields
- `publishedAt: DateTime` — nullable on the revision

**ArticleFilter** (input) — `authors`, `title/lead/body/preTitle`, `draft/pending/published: Boolean`, `includeHidden`, `shared`, `peerId`, `tags/tagsNotIn`, `publicationDateFrom/To`.

## Key queries & mutations
- `article(id, slug): Article!` — public
- `articles(filter, sort: ArticleSort = PublishedAt, take, skip, cursorId): PaginatedArticles!` — public
- `hotAndTrending(start, take): [Article!]!` — public, most-viewed articles
- `createArticle(...)` / `updateArticle(id, ...)` / `duplicateArticle(id)` — admin (both take the full field set: blocks, authorIds, tagIds, slug, paywallId, shared, hidden, …)
- `publishArticle(id, publishedAt: DateTime!)` / `unpublishArticle(id)` — admin
- `deleteArticle(id): String!` — admin
- `likeArticle(id)` / `dislikeArticle(id)` — public
- `importPeerArticle(peerId, articleId, options)` — admin (see peering.md)

## Permissions
`@Public()`: `article`, `articles`, `hotAndTrending`, `likeArticle`, `dislikeArticle`. Gated: `createArticle`, `updateArticle`, `duplicateArticle` → `CanCreateArticle`; `deleteArticle` → `CanDeleteArticle`; `publishArticle`, `unpublishArticle` → `CanPublishArticle`; the `draft` and `pending` resolve fields require `CanGetArticle`, so unauthenticated clients only see published content.

## Gotchas
- Publish lifecycle: `updateArticle` writes a new draft revision; `publishArticle(id, publishedAt)` schedules it — Prisma exposes the slots as DB views (`articles.revisions.draft/pending/published`), so a future `publishedAt` keeps the revision in `pending` until due. `unpublishArticle` unpublishes *all* revisions.
- There is no `updateArticleRevision`-style API: revisions are immutable snapshots; every edit goes through `updateArticle`.
- `updateArticle` requires `CanCreateArticle`, not a separate update permission.
- `Article.publishedAt` and `slug` are nullable — unpublished drafts have neither.
- `likes` is a plain counter mutated by public, unauthenticated `likeArticle`/`dislikeArticle`.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (Article, ArticleRevision, views)
- `libs/article/api/src/lib/article.resolver.ts`, `article-revision.resolver.ts`, `hot-and-trending/hot-and-trending.resolver.ts`
