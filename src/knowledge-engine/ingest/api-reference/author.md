# Author — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/author/api/src/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Authors are bylines/profiles attached to article revisions (regular and social-media author lists) and rendered on team pages. They carry a rich-text bio, an avatar image, external links, and per-context visibility flags.

## Key types
**Author**
- `name: String!`, `slug: Slug!` — slug is unique per peer (Prisma `@@unique([slug, peerId])`)
- `jobTitle: String`, `bio: RichText` — nullable
- `image: Image`, `imageID: String` — avatar
- `links: [AuthorLink!]!` — external profile links
- `hideOnArticle: Boolean!`, `hideOnTeaser: Boolean!`, `hideOnTeam: Boolean!` — visibility toggles
- `peer: Peer`, `peerId: String` — set when imported via peering
- `tags: [Tag!]!`, `url: String!`

**AuthorLink** — `title: String!`, `url: String!` (input twin `AuthorLinkInput` is identical).

**AuthorFilter** (input) — `name`, `tagIds`, `hideOnTeam`.

**AuthorSort** enum — `CreatedAt | ModifiedAt | Name`.

## Key queries & mutations
- `author(id, slug): Author` — public; nullable return (not an error if missing)
- `authors(filter, sort: AuthorSort = ModifiedAt, take, skip, cursorId): PaginatedAuthors!` — public
- `createAuthor(name!, slug!, bio, jobTitle, imageID, links!, tagIds!, hideOnArticle!, hideOnTeam!, hideOnTeaser!)` — admin
- `updateAuthor(id!, …all optional…)` — admin
- `deleteAuthor(id): Author!` — admin

## Permissions
`@Public()`: `author`, `authors`. Gated: `createAuthor`, `updateAuthor` → `CanCreateAuthor`; `deleteAuthor` → `CanDeleteAuthor` (`libs/author/api/src/lib/author.resolver.ts`).

## Gotchas
- `author(...)` returns nullable `Author`, unlike `article`/`page` which return non-null and error when missing.
- Authors are linked to article *revisions*, not articles: join tables `articles.revisions.author` and `articles.revisions.social-media-author` — each revision snapshots its own author list.
- Author slugs are only unique in combination with `peerId`, so a local author and a peer-imported author can share a slug.
- `updateAuthor` requires `CanCreateAuthor` — no separate update permission.
- Deleting an author cascades out of revision author lists (Prisma `onDelete: Cascade` on the join tables).

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (Author, AuthorsLinks, ArticleRevisionAuthor, ArticleRevisionSocialMediaAuthor)
- `libs/author/api/src/lib/author.resolver.ts`
