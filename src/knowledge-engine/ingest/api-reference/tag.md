# Tag — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/tag/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Tags are typed labels attached to articles, pages, authors, events and comments. They drive tag pages (public `url`), teaser/block filtering (e.g. `EventBlockFilter.tags`, `TeaserListBlock` tag filters) and editorial organisation. A tag always belongs to exactly one `TagType`.

## Key types
- **Tag**
  - `tag: String` — the label itself (nullable in schema)
  - `type: TagType!` — which entity family the tag belongs to
  - `main: Boolean!` — marks "main" tags (default false), used to feature tags
  - `color: Color`, `description: RichText`
  - `url: String!` — computed public tag-page URL (SDL only, not a Prisma column)
- **TagType** (enum) — `Article | Author | Comment | Event | Page`
- **TagFilter** — `tag: String`, `tags: [String!]`, `type: TagType`
- **TagSort** (enum) — `CreatedAt | ModifiedAt | Tag`

## How tags attach
Prisma join tables, one per entity: `TaggedArticles`, `TaggedPages`, `TaggedAuthors`, `TaggedEvents`, `TaggedComments` (composite PK of entity id + tagId, cascade delete both ways). On the GraphQL side, entities accept `tagIds: [String!]` in their create/update mutations (`createArticle`, `createEvent`, `createComment`, `updateAuthor`, `updatePage`, ...) and expose resolved `tags: [Tag!]`.

## Key queries & mutations
- `tag(id, tag, type): Tag!` — lookup by id **or** by (tag, type) — **public**
- `tags(filter: TagFilter, sort: TagSort = CreatedAt, take, skip, ...): PaginatedTags` — **public**
- `createTag(tag, type, main, color, description): Tag!` — admin
- `updateTag(id, ...)`, `deleteTag(id)` — admin

## Permissions
- `tag`, `tags`: `@Public()`
- `createTag`: `CanCreateTag`; `updateTag`: `CanUpdateTag`; `deleteTag`: `CanDeleteTag`

## Gotchas
- Uniqueness is per type: Prisma enforces `@@unique([type, tag])`, so the same string can exist once per `TagType` (an "Umwelt" article tag and an "Umwelt" event tag are different rows).
- Deleting a tag cascades through all join tables — it silently detaches from every article/page/event/comment/author.
- Prisma `Tag` has a `peerId` relation (peered content); this is not exposed as a field on the GraphQL `Tag` type at this commit.
- `Tag.tag` is nullable in both Prisma and SDL — code must tolerate label-less tags.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (model `Tag`, enum `TagType`, `Tagged*` join models)
- `libs/tag/api/src/lib/tag.resolver.ts`
