# Peering — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/peering/api/src/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Peering is We.Publish's cross-newsroom content-sharing mechanism. Each instance exposes a `PeerProfile` (branding + call-to-action) and registers other instances as `Peer` records (hostURL + token). Editors browse the peers' shared articles remotely and import them as local drafts.

## Key types
**Peer** — a registered remote instance.
- `hostURL: String!`, `token: String!` — credentials used to query the peer's API
- `slug: String!` (unique), `name: String!`, `isDisabled: Boolean`, `information: RichText`
- `profile: RemotePeerProfile` — resolved live from the remote host

**PeerProfile** — this instance's own public profile: `name!`, `hostURL!`, `websiteURL!`, `themeColor!`, `themeFontColor!`, `logo`/`squareLogo: Image`, `callToActionText: RichText!`, `callToActionURL!`, optional `callToActionImage`/`callToActionImageURL`. **RemotePeerProfile** is the same shape but with `PeerImage` instead of `Image`.

**PeerArticle** — remote article as listed from peers: `peerId`, `latest: PeerArticleRevision!` (`title/lead/preTitle/seoTitle`, `image: PeerImage`), `publishedAt: DateTime!`, `slug`, `url!`.

**PeerImage** — remote image with pre-rendered size URLs: `xxs…xxl` plus `xsSquare…xxlSquare` variants (all nullable Strings), alongside normal image metadata — no `transformURL`.

## Key queries & mutations
- `peers: [Peer!]!` — admin (`CanGetPeers`); `peer(id, slug): Peer` — public, nullable
- `peerProfile: PeerProfile!` — public (own profile)
- `remotePeerProfile(hostURL!, token!): RemotePeerProfile!` — admin; used to validate credentials when adding a peer
- `createPeer(name!, slug!, hostURL!, token!, information, isDisabled)` / `updatePeer(id, …)` / `deletePeer(id)` — admin
- `updatePeerProfile(name!, logoID!, squareLogoId!, themeColor!, themeFontColor!, callToActionText!, callToActionURL!, callToActionImageID!, callToActionImageURL)` — admin
- `peerArticles(filter: PeerArticleFilter, sort: ArticleSort = PublishedAt, take, skip): PaginatedPeerArticles!` — admin; fans out live to each peer's `/v1` GraphQL endpoint, querying only `shared: true` articles
- `importPeerArticle(peerId!, articleId!, options = {importAuthors, importContentImages, importTags: true}): Article!` — admin

## Permissions
`@Public()`: `peer`, `peerProfile`. Gated: `peers` → `CanGetPeers`; `createPeer`, `updatePeer`, `remotePeerProfile` → `CanCreatePeer`; `deletePeer` → `CanDeletePeer`; `updatePeerProfile` → `CanUpdatePeerProfile`; `peerArticles`, `importPeerArticle` → `CanGetPeerArticles`.

## Gotchas
- Peer articles are not synced or mirrored: `peerArticles` queries remote hosts at request time, and `importPeerArticle` copies the peer's *published* revision into a local **draft** with `peerId` + `peerArticleId` set and `shared: false` — subsequent remote edits do not propagate.
- Sharing is opt-in per article via `Article.shared`; the remote listing filters `shared: true` on the peer side.
- Import also copies dependencies: authors (deduped by `slug + peerId`), tags, and images (re-uploaded into the local media library) according to `ImportArticleOptions`.
- `Peer.token` is a field on the GraphQL `Peer` type — treat peer objects as sensitive.
- `updatePeerProfile` makes `logoID`, `squareLogoId`, and `callToActionImageID` required (`String!`) even though the profile type allows them to be null.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (Peer, PeerProfile)
- `libs/peering/api/src/lib/peer.resolver.ts`, `peer-profile.resolver.ts`, `remote/`
- `libs/peering/api/import/src/lib/import-peer-article/import-peer-article.resolver.ts`, `import-peer-article.service.ts`
