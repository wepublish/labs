# Poll — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/poll/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Reader polls: a question with answers, opened/closed by date, votable by logged-in users and (optionally) anonymous guests. Polls are embedded in content via the `PollBlock`. Editors can additionally record vote tallies from external sources (e.g. a print/partner poll) per answer.

## Key types
- **Poll** — lean list shape: `question: String`, `infoText: RichText`, `opensAt: DateTime!`, `closedAt: DateTime`, `id`.
- **FullPoll** — Poll plus `answers: [PollAnswer!]!` and `externalVoteSources: [PollExternalVoteSource!]!`; returned by single-poll queries and poll mutations.
- **PollAnswer** — `answer: String`, `pollId: String!`, `votes: Int!` (aggregated count, resolved from a Prisma `_count`).
- **PollVote** — one cast vote: `answerId`, `pollId`, `userId: String` (null for guests), `fingerprint: String` (guest dedupe), `disabled: Boolean!`, `createdAt`.
- **PollExternalVoteSource** — `source: String`, `voteAmounts: [PollExternalVote!]!`.
- **PollExternalVote** — `answerId: String!`, `amount: VoteValue!` (Int in Prisma, default 0).
- **PollBlock** — content block holding `pollId` / resolved `poll: FullPoll`.

## Key queries & mutations
- `poll(id): FullPoll!`, `polls(filter: PollFilter, sort: PollSort = OpensAt, ...): PaginatedPolls!` — **public** (`PollFilter.openOnly`)
- `userPollVote(pollId): String` — logged-in user's answerId for a poll (authenticated)
- `pollVotes(filter: PollVoteFilter, ...): PaginatedPollVotes!` — admin
- `voteOnPoll(answerId): PollVote` — **public** mutation, casts or updates a vote
- Admin mutations: `createPoll`, `updatePoll`, `deletePoll`, `createPollAnswer`, `deletePollAnswer`, `createPollExternalVoteSource`, `deletePollExternalVoteSource`, `deletePollVotes(ids)`

## Permissions
- `@Public()`: `poll`, `polls`, `voteOnPoll`; `userPollVote` requires `@Authenticated()`
- `CanCreatePoll`: `createPoll`, `createPollAnswer`, `createPollExternalVoteSource`
- `CanUpdatePoll`: `updatePoll`, `deletePollAnswer`, `deletePollExternalVoteSource`
- `CanDeletePoll`: `deletePoll`; `CanGetPollVote`: `pollVotes`; `CanDeletePollVote`: `deletePollVotes`

## Gotchas
- Anonymous voting via `voteOnPoll` only works when the `ALLOW_GUEST_POLL_VOTING` setting is truthy; the service rejects guests otherwise (`poll-vote.service.ts`).
- One vote per user per poll is enforced at DB level (`@@unique([pollId, userId])` on `polls.votes`); re-voting updates the decision rather than adding a vote. Guests are deduped by request `fingerprint`.
- `deletePollExternalVoteSource` is gated by `CanUpdatePoll`, not a delete permission.
- `updatePoll` takes the full `answers` and `externalVoteSources` arrays in one call (replace-style update), unlike the granular create/delete answer mutations.
- The committed SDL exposes `Poll` (no answers) in paginated lists but `FullPoll` for single fetch — clients listing polls must refetch by id to get answers.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `Poll`, `PollAnswer`, `PollVote`, `PollExternalVoteSource`, `PollExternalVote`)
- `libs/poll/api/src/lib/poll.resolver.ts`, `poll-answer.resolver.ts`, `poll-vote.resolver.ts`, `poll-vote.service.ts`
