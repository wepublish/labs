# Comment — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/comments/api/src/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Comments attach to articles or pages (`itemType: article | page`), support threading via `parentID`, and go through a moderation state machine. A configurable rating system lets readers rate comments (e.g. stars per answer dimension), with editorial overrides.

## Key types
**Comment**
- `itemID: String!`, `itemType: CommentItemType!` (`article | page`), `parentID: String`, `children: [Comment!]!`
- `state: CommentState!` — `approved | pendingApproval | pendingUserChanges | rejected`
- `rejectionReason: CommentRejectionReason` — `misconduct | spam`
- `authorType: CommentAuthorType!` — `author | guestUser | team | verifiedUser`
- `user: User`, `userID: String` — nullable; guests use `guestUsername` + `guestUserImage`
- `revisions: [CommentRevision!]!` — edit history (`title`, `lead`, `text: RichText`); `text/title/lead` on Comment surface the current revision
- `calculatedRatings: [CalculatedRating!]!` (count/mean/total per answer), `userRatings: [CommentRating!]!`, `overriddenRatings: [OverriddenRating!]!`
- `featured: Boolean`, `source: String`, `tags: [Tag!]!`, `url: String!`

**CommentRating** — `commentId!`, `answer: CommentRatingSystemAnswer!`, `value: Int!`, `userId: String` (nullable), `fingerprint: String` (anonymous dedupe), `disabled: Boolean`.

**CommentRatingSystem** — `name`, `answers: [CommentRatingSystemAnswer!]!`; each answer has `answer: String`, `type: RatingSystemType!` (only `star`).

## Key queries & mutations
- `comment(id)` / `comments(filter, sort: CommentSort = ModifiedAt, …)` — admin moderation list
- `commentsForItem(itemId!, itemType!, sort: CommentSort = Rating): [Comment!]!` — public, nested/sorted
- `addUserComment(itemID!, itemType!, text!, parentID, title, guestUsername, challenge)` — public (challenge for anonymous)
- `updateUserComment(id!, text, title, lead)` — authenticated user editing own comment
- `createComment(...)` / `updateComment(id!, revision, featured, ratingOverrides, tagIds, userID, …)` — admin
- `approveComment(id)` / `rejectComment(id, rejectionReason!)` / `requestChangesOnComment(id, rejectionReason!)` — moderation
- `deleteComment(id)` — admin
- `rateComment(commentId!, answerId!, value: Int!)` — public (logged in or anonymous)
- `ratingSystem: CommentRatingSystem!` — public; `updateRatingSystem`, `createRatingSystemAnswer`, `deleteRatingSystemAnswer` — admin

## Permissions
`@Public()`: `commentsForItem`, `addUserComment`, `rateComment`, `ratingSystem`. `@Authenticated()`: `updateUserComment`. Gated: `comments`, `comment` → `CanGetComments`; `createComment`, `updateComment` → `CanUpdateComments`; `deleteComment` → `CanDeleteComments`; `approveComment`, `rejectComment`, `requestChangesOnComment` → `CanTakeActionOnComment`; rating-system mutations → `CanUpdateCommentRatingSystem`.

## Gotchas
- Comment content is revisioned: edits append a `CommentsRevisions` row rather than overwriting; moderation of edits goes through `pendingUserChanges`.
- Anonymous ratings are deduped by `fingerprint` with a DB unique on `(answerId, commentId, userId)` — `userId` is nullable, so anonymous duplicates rely on the fingerprint, not the constraint.
- `OverriddenRating.value` is nullable `Int` — editors can blank out a crowd rating per answer, not just replace it.
- `Comment.featured` is nullable in GraphQL but a non-null `Boolean @default(false)` in Prisma.
- Article-level `disableComments` lives on Article, not on the comment domain — check both when comments "don't work".

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (Comment, CommentsRevisions, CommentRating*, enums)
- `libs/comments/api/src/lib/comment.resolver.ts`, `rating-system/rating-system.resolver.ts`
