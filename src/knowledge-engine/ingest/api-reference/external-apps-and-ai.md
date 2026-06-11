# External Apps & AI — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/external-apps/api/src/`, `libs/ai/api/src/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Two adjacent extension surfaces. **External apps** register third-party tools in the editor (opened in an iframe or new tab) and mint short-lived JWTs so the app can identify the editor user. **AI** integrates Vercel's v0 via `v0-sdk` to generate HTML from a prompt inside the editor (used for HTML blocks), configured through the `SettingAIProvider` record.

## Key types
- **ExternalApp** — `name: String!`, `description: String`, `url: String!`, `icon: String`, `target: ExternalAppsTarget!`, timestamps. Prisma model is `ExternalApps` (table `apps.external`).
- **ExternalAppsTarget** (enum) — `IFRAME | BLANK`
- **ExternalAppToken** — `token: String!`, `expiresAt: DateTime!` — short-lived JWT for the app handshake.
- **Chat** (AI) — `chatId: String!`, `message: String!` — `message` is the generated HTML; `chatId` lets you continue the same v0 chat.
- **SettingAIProvider** — `type: AIProviderType!` (only `V0` at this commit), `name`, `systemPrompt: String`, `lastLoadedAt`; `apiKey` is accepted on the mutation but never exposed on the type.

## Key queries & mutations
- `externalApps(filter: ExternalAppFilter)`, `externalApp(id)` — any authenticated user
- `createExternalApp(input)`, `updateExternalApp(...)`, `deleteExternalApp(id)` — admin
- `createExternalAppToken(externalAppId): ExternalAppToken!` — authenticated; issues the JWT for the current user
- `promptHTML(query!, chatId): Chat!` — AI generation query
- `aiSetting(id)`, `aiSettings(filter)`, `updateAISetting(id, name, apiKey, systemPrompt)` — admin

## Permissions
- `externalApps` / `externalApp` / `createExternalAppToken`: `@Authenticated()` (no `Can*` constant — any logged-in session)
- `CanCreateExternalApp` / `CanUpdateExternalApp` / `CanDeleteExternalApp` on the CRUD mutations
- `promptHTML`: `@Permissions(CanCreateArticle, CanCreatePage)` — reuses content permissions, no dedicated AI permission
- AI settings: `CanGetAISettings` / `CanUpdateAISettings` (resolver also defines create/delete with `CanCreateAISettings` / `CanDeleteAISettings`)

## v0 resolver architecture (libs/ai)
`V0Resolver` loads the provider row with hardcoded id `'v0'` from `settingAIProvider`, decrypts `apiKey` with `SecretCrypto`, caches `{apiKey, systemPrompt}` in `KvTtlCacheService` namespace `settings:ai` for 6h, then calls `v0.chats.create` (new chat, with system prompt) or `v0.chats.sendMessage` (when `chatId` is passed), `responseMode: 'sync'`, thinking disabled. It extracts the first `Codeblock` with `lang === 'html'` from the response and throws `BadRequestException` if none is found.

## Gotchas
- `promptHTML` is a **Query**, not a Mutation, despite creating chats on v0's side.
- The committed SDL contains only `updateAISetting`; `createAISetting` / `deleteAISetting` exist in `ai-settings.resolver.ts` but are absent from this schema snapshot — the SDL file can lag resolver code.
- The AI config row id is hardcoded to `'v0'`; settings changes can take up to 6h to apply due to the KV TTL cache (`lastLoadedAt` is bumped on each cache load).
- `libs/external-apps/api` also ships a REST controller (`external-apps-userinfo.controller.ts`) for the app-side userinfo lookup — not part of the GraphQL SDL.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `ExternalApps`, `SettingAIProvider`, enums `ExternalAppsTarget`, `AIProviderType`)
- `libs/external-apps/api/src/lib/external-apps.resolver.ts`
- `libs/ai/api/src/lib/v0.resolver.ts`, `v0.model.ts`
- `libs/settings/api/src/lib/integrations/ai-settings.resolver.ts`, `ai-settings.service.ts`
