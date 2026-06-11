# Image — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/image/api/src/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
The image library backs every visual in the CMS (article/page hero and social images, blocks, author avatars, member plans, peer profile logos). Binary files live on a separate media server; the API stores metadata plus a focal point and resolves URLs through a `MediaAdapter`.

## Key types
**Image**
- `url: String!` — resolved at query time via `MediaAdapter.getImageURL(image)`
- `transformURL(input: ImageTransformation): String` — field-level arg returning a transformed variant URL
- `focalPointX: Float!`, `focalPointY: Float!` — crop anchor, both default 0.5 (center)
- `width/height: Int!`, `fileSize: Int!`, `extension/format/mimeType: String!`
- `filename/title/description/license/link/source: String` — all nullable metadata
- `tags: [String!]!` — plain string tags (not Tag entities)
- `peer: Peer`, `peerId: String` — set on peer-imported images

**ImageTransformation** (input) — `width`, `height`, `rotation: ImageRotation` (`Auto|Rotate0|Rotate90|Rotate180|Rotate270`), `blur`, `grayscale`, `negate`, `sharpen`.

**ImageFilter** (input) — `title`, `tags`.

## Key queries & mutations
- `image(id): Image!` — admin (`CanGetImage`)
- `images(filter, sort: ImageSort = ModifiedAt, take, skip, cursorId): PaginatedImages!` — admin (`CanGetImages`)
- `getImagesByTag(tag): [Image!]!` — public
- `uploadImage(file: Upload!, focalPointX = 0.5, focalPointY = 0.5, tags!, title, description, license, link, source, filename): Image!` — admin
- `updateImage(id, …metadata + focal point…): Image!` — admin (no file replacement arg)
- `deleteImage(id): String!` — admin (also deletes from media server via adapter)

## Permissions
Gated: `image` → `CanGetImage`, `images` → `CanGetImages`, `uploadImage`, `updateImage` → `CanCreateImage`, `deleteImage` → `CanDeleteImage`. `@Public()`: only `getImagesByTag`. (`libs/image/api/src/lib/image.resolver.ts`)

## Gotchas
- `Image.id` has no Prisma default (`id String @id`) — the ID is assigned during upload by the media pipeline, unlike most models (cuid).
- The direct `image(id)` query is permission-gated even though images are publicly readable when embedded in articles/pages/authors via resolve fields — public clients reach images through content, not the library.
- `transformURL` is an argument on a field, not a separate query; passing no input returns null-safe `String` (nullable).
- The media server is abstracted behind `MediaAdapter` (`uploadImage`, `deleteImage`, `getImageURL(image, transformation?)`) — the API DB never stores final URLs.
- Peer-hosted images surface as a different type, `PeerImage`, with pre-rendered size URLs (`xs…xxl`, `*Square`) instead of `transformURL` (see peering.md).

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (Image)
- `libs/image/api/src/lib/image.resolver.ts`, `media-adapter.ts`, `image-upload.service.ts`
