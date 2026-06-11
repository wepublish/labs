# Settings — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/settings/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
Two distinct things share the name: (1) simple key/value instance **settings** (feature flags and limits, enum-named, JSON values with optional restrictions), and (2) **provider settings** — per-integration configuration records (mail, payment, analytics, challenge/captcha, sync, tracking pixel, AI), each its own Prisma model and resolver with its own permissions.

## Key types
- **Setting** — `name: SettingName!`, `value: GraphQLSettingValueType` (JSON scalar), `settingRestriction: SettingRestriction`.
- **SettingName** (enum, 18 values) — incl. `ALLOW_GUEST_COMMENTING`, `ALLOW_COMMENT_EDITING`, `ALLOW_GUEST_POLL_VOTING`, `COMMENT_CHAR_LIMIT`, `PEERING_TIMEOUT_MS`, `RESET_PASSWORD_JWT_EXPIRES_MIN`, `SEND_LOGIN_JWT_EXPIRES_MIN`, `NEW_ARTICLE_PAYWALL`, `NEW_ARTICLE_PEERING`, `SHOW_PENDING_WHEN_NOT_PUBLISHED`, and the `MAKE_*_API_PUBLIC` family that opens individual stats endpoints (revenue, new/active/renewing subscribers, deactivations).
- **SettingRestriction** — `maxValue/minValue: Int`, `inputLength: Int`, `allowedValues: AllowedSettingVals`.
- **SettingProvider** (interface) — `id`, `name`, `createdAt`, `modifiedAt`, `lastLoadedAt`. Implementations: `SettingMailProvider`, `SettingPaymentProvider` (Stripe/Payrexx/Mollie/Bexio fields), `SettingAnalyticsProvider`, `SettingChallengeProvider`, `SettingSyncProvider` (Mailchimp), `SettingTrackingPixelProvider` (ProLitteris), `SettingAIProvider` (see external-apps-and-ai.md).

## Key queries & mutations
- `settings(filter: SettingFilter)`, `setting(name)` — **public**
- `settingById(id)` — admin; `updateSetting(name: SettingName!, value)` — admin
- Per provider (all admin): `mailProviderSetting(s)`, `paymentProviderSetting(s)`, `analyticsProviderSetting(s)`, `challengeProviderSetting(s)`, `syncProviderSetting(s)`, `trackingPixelSetting(s)`, `aiSetting(s)` queries plus `update<X>ProviderSetting` mutations (e.g. `updateMailProviderSetting`, `updatePaymentProviderSetting`, `updateSyncProviderSetting`, `updateTrackingPixelSetting`, `updateAISetting`).

## Permissions
- KV settings: reads `@Public()` (list + by-name); `settingById` `CanGetSettings`; `updateSetting` `CanUpdateSettings`.
- Provider settings: per-domain constants, e.g. `CanGetMailProviderSettings` / `CanCreate…` / `CanUpdate…` / `CanDelete…`, `CanGetAISettings` etc. — nothing public.

## Gotchas
- `settings` / `setting` are fully public and unfiltered — every KV setting value is world-readable. Secrets must never go into the KV `Setting` table; provider models exist partly for that reason.
- `updateSetting` addresses settings by `name`, not id, and validates the new value against `settingRestriction` (`checkSettingRestrictions`) before writing.
- Provider `apiKey`s are write-only: input fields exist on mutations, but no `apiKey` field is exposed on the output types; the AI provider's key is encrypted at rest (`SecretCrypto`).
- Several resolvers double-stack the same decorator (`@Permissions(CanGetSettings)` twice on `settingById`) — harmless, but visible in the source.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma` (models `Setting`, `SettingMailProvider`, `SettingPaymentProvider`, `SettingAIProvider`, `SettingAnalyticsProvider`, `SettingSyncProvider`, `SettingChallengeProvider`, `SettingTrackingPixel`)
- `libs/settings/api/src/lib/settings.resolver.ts`, `settings.service.ts`, `integrations/*.resolver.ts`
