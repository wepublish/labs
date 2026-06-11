# Consent — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/consent/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
GDPR-style consent management. A `Consent` defines a consent category (e.g. a newsletter or tracking opt-in) with a default value; a `UserConsent` records one user's yes/no decision for one consent. One decision per user per consent.

## Key types
- **Consent**
  - `name: String!`, `slug: String!` — slug is unique (Prisma `@unique`)
  - `defaultValue: Boolean!` — what applies before the user decides
  - `createdAt`, `modifiedAt`
- **ConsentFilter** — `name`, `slug`, `defaultValue`
- **UserConsent**
  - `consent: Consent!`, `user: User!`
  - `value: Boolean!` — the user's decision
  - Prisma enforces `@@unique([userId, consentId])`

## Key queries & mutations
- `consents(filter: ConsentFilter): [Consent!]!`, `consent(id): Consent!` — **public**
- `createConsent(name, slug, defaultValue)`, `updateConsent(id, ...)`, `deleteConsent(id)` — admin
- `userConsents(name, slug, value): [UserConsent!]!`, `userConsent(id): UserConsent!` — public resolvers (see gotcha)
- `createUserConsent(consentId, userId, value)`, `updateUserConsent(id, value)`, `deleteUserConsent(id)` — authenticated

## Permissions
- Consent definitions: reads `@Public()`; `CanCreateConsent` / `CanUpdateConsent` / `CanDeleteConsent` on mutations.
- UserConsent mutations: `@Authenticated()` with in-resolver ownership checks — `createUserConsent` throws `ForbiddenException` unless the caller has the `admin` role or is the affected user; update/delete pass the session to the service for the same kind of check.

## Gotchas
- `userConsents` / `userConsent` queries are decorated `@Public()` in `user-consent.resolver.ts` — access control for reading other users' consents is not enforced at the resolver decorator level at this commit.
- Authorization for user-consent mutations is role-string based (`roleIDs.includes('admin')`), not a `Can*` permission constant — custom roles with consent permissions won't pass this check.
- `slug` is the unique handle (name is not unique); filter by slug when integrating.
- No paginated wrapper: consent queries return plain arrays, unlike most list queries in the API.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `Consent`, `UserConsent`)
- `libs/consent/api/src/lib/consent/consent.resolver.ts`
- `libs/consent/api/src/lib/user-consent/user-consent.resolver.ts`
