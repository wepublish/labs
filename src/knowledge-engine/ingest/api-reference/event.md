# Event — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/event/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Events are calendar entries (concerts, readings, etc.) that a publication lists and embeds in articles/pages via the `EventBlock`. The domain includes a separate import pipeline that pulls events from external agenda providers and copies them into the local database.

## Key types
- **Event** — a single event.
  - `name: String!`, `lead: String`, `description: RichText` — title, teaser, body
  - `startsAt: DateTime!`, `endsAt: DateTime`, `location: String`
  - `status: EventStatus!` — see enum below
  - `image: Image` / `imageId: String`, `tags: [Tag!]`
  - `externalSourceName: String`, `externalSourceId: String` — provenance when imported
  - `url: String!` — computed public URL (SDL only, not stored in Prisma)
- **EventStatus** (enum) — `Scheduled | Rescheduled | Postponed | Cancelled` (default `Scheduled`)
- **EventFromSource** — an importable event as seen at the provider; same shape as Event but with `imageUrl: String` instead of an Image relation.
- **EventFilter** — `from/to: DateTime`, `name`, `location`, `tags: [String!]`, `upcomingOnly: Boolean`
- **EventBlock / EventBlockFilter** — content block embedding events by explicit `events: [String!]` ids or `tags: [String!]`.
- **EventTeaser** — teaser variant referencing an event (`eventID`).

## Key queries & mutations
- `event(id)` , `events(filter, sort: EventSort = StartsAt, order, skip, take, cursorId)` — **public**
- `createEvent(...)`, `updateEvent(...)`, `deleteEvent(id)` — admin
- Import pipeline (admin): `eventProviders: [String!]!`, `importedEvents(filter: ImportedEventFilter, ...)`, `importedEvent(filter: SingleEventFilter!)`, `importedEventsIds: [String!]!`, and mutation `importEvent(id, source): String!`

## Permissions
- `event` / `events`: `@Public()`
- `createEvent`: `CanCreateEvent`; `updateEvent`: `CanUpdateEvent`; `deleteEvent`: `CanDeleteEvent`
- All `imported*` / `eventProviders` queries: `CanGetImportedEvents`; `importEvent`: `CanCreateEvent`

## Gotchas
- `importEvent` returns a plain `String` (the new event id), not an `Event`, and also uploads the provider image into the We.Publish image library.
- Built-in import providers at this commit: Agenda Basel and Kultur Züri (`agenda-basel.service.ts`, `kultur-zueri.service.ts`); providers are pluggable via the `EventsImportModule`.
- `importedEventsIds` exists specifically to dedupe: it returns external source ids of events already imported.
- `Event.description` is `Json[]` in Prisma but surfaces as the `RichText` scalar in GraphQL.
- Tags attach via the `TaggedEvents` join table (cascade delete on both sides); only tags of `TagType.Event` are meant for events.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `Event`, `TaggedEvents`, enum `EventStatus`)
- `libs/event/api/src/lib/event.resolver.ts`
- `libs/event/import/api/src/lib/import/events-import.resolver.ts`, `.../events-import.service.ts`, `.../agenda-basel.service.ts`, `.../kultur-zueri.service.ts`
