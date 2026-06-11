# Blocks — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/block-content/api/src/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
All article and page content is composed of blocks: `ArticleRevision.blocks` and `PageRevision.blocks` are `[BlockContent!]!`, a 31-member GraphQL union. Blocks persist as a JSON column on the revision row, not as separate DB rows.

## Key types
**BlockContent** (union, 31 members) — all implement `BaseBlock` (`type: BlockType!`, `blockStyle`, `blockStyleName`, `disabled`):
- Content: `TitleBlock` (preTitle/title/lead), `RichTextBlock` (richText!), `ImageBlock` (imageID, caption, linkUrl), `ImageGalleryBlock` (images), `ListicleBlock` (items: title/imageID/richText), `QuoteBlock` (quote, author, imageID), `HTMLBlock` (html), `BreakBlock` (richText!, linkURL/linkText/linkTarget, hideButton, imageID)
- Embeds: `IFrameBlock` (url, title, width, height, sandbox, styleCustom), `PolisConversationBlock` (conversationID), `BildwurfAdBlock` (zoneID)
- Social embeds: `FacebookPostBlock` (userID, postID), `FacebookVideoBlock`, `InstagramPostBlock`, `TwitterTweetBlock` (userID, tweetID), `TikTokVideoBlock`, `VimeoVideoBlock`, `YouTubeVideoBlock`, `StreamableVideoBlock` (videoID), `SoundCloudTrackBlock` (trackID)
- Data-driven: `PollBlock` (pollId → FullPoll), `EventBlock` (filter: events/tags), `CommentBlock` (filter: item/tags/comments), `CrowdfundingBlock` (crowdfundingId), `SubscribeBlock` (memberPlanIds, fields: [SubscribeBlockField!]!)
- Teasers: `TeaserGridBlock` (numColumns, teasers), `TeaserGridFlexBlock` (flexTeasers with x/y/w/h alignment), `TeaserListBlock` (tag filter + sort + take/skip, autofilled), `TeaserSlotsBlock` (slots: Manual|Autofill + autofillConfig)
- Layout: `FlexBlock` (blocks: [BlockWithAlignment!]! — nests any BlockContent with a FlexAlignment)
- `UnknownBlock` — fallback for unrecognized stored blocks

**Teaser** (union) — `ArticleTeaser | PageTeaser | EventTeaser | CustomTeaser`; each has optional override `image/preTitle/title/lead` plus a target ID; `CustomTeaser` adds `contentUrl`, `openInNewTab`, `properties`.

**BlockStyle** — named visual variant: `name: String!` (unique), `blocks: [EditorBlockType!]!`. Referenced from blocks via string fields `blockStyle`/`blockStyleName`, not a relation.

**BlockContentInput** (input) — one optional key per block kind (`title`, `richText`, `image`, `embed`, `linkPageBreak`, `teaserGrid`, …); one key set per list entry.

## Key queries & mutations
- `blockStyles: [BlockStyle!]!` — public
- `createBlockStyle(name, blocks)` / `updateBlockStyle(id, …)` / `deleteBlockStyle(id)` — admin
- Blocks have no standalone CRUD: they are written via `createArticle`/`updateArticle`/`createPage`/`updatePage` with `blocks: [BlockContentInput!]!`.

## Permissions
`@Public()`: `blockStyles`. Gated: `createBlockStyle` → `CanCreateBlockStyle`, `updateBlockStyle` → `CanUpdateBlockStyle`, `deleteBlockStyle` → `CanDeleteBlockStyle`.

## Gotchas
- Input key names diverge from type names: `embed` → IFrameBlock, `linkPageBreak` → BreakBlock. `UnknownBlock` has no input — output-only.
- Two "block type" enums: GraphQL `BlockType` has 30 values (incl. social embeds); `EditorBlockType` / Prisma `BlockType` have only 20 (no social embeds; TeaserGrid split into `TeaserGrid1`/`TeaserGrid6`). BlockStyles can only target the editor set.
- `teasers: [Teaser]!` allows null items (empty grid slots).
- `TeaserSlotsBlock` mixes manual and autofilled content: `slots` declares layout, `autofillConfig`/`autofillTeasers` fill `Autofill` slots from a tag filter.
- Every block has `disabled: Boolean`; disabled blocks stay in the revision JSON.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (BlockStyle, BlockType; `blocks Json` on revisions)
- `libs/block-content/api/src/lib/` (block-content.model.ts, block-styles/block-styles.resolver.ts)
