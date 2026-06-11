# Mail — We.Publish API reference

**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/api-example/schema-v2.graphql`, `libs/mail/...`, `libs/membership/api/src/lib/mail-template/...`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## Purpose
The mail domain abstracts transactional email behind a provider interface (Mailgun, Mailchimp/Mandrill, Slack, Fake), stores template references synced from the provider, and wires templates to system events (SystemMail for user events, SubscriptionIntervals for subscription events). A separate Mailchimp *sync* provider pushes audience/merge-field data.

## Key types
**MailTemplateWithUrlAndStatusModel** — template as known locally + provider status: `externalMailTemplateId: String!`, `remoteMissing: Boolean!`, `status: String!`, `url: String!` (edit link at the provider), `content: MailTemplateContentModel!` (`html`, `subject` fetched remotely).

**MailTemplateRef** — lightweight `{id, name}` reference used by SubscriptionInterval and SystemMailModel.

**MailProviderModel / MailProviderType** — active provider info; types: `MAILCHIMP`, `MAILGUN`, `SLACK`.

**SystemMailModel** — `event: UserEvent!` (`ACCOUNT_CREATION`, `PASSWORD_RESET`, `LOGIN_LINK`, `EMAIL_CHANGE`, `TEST_MAIL`) → `mailTemplate: MailTemplateRef`. Backed by Prisma `UserFlowMail` (table `user_communication_flows`, event unique).

**MailPlaceholderGroupModel / MailPlaceholderModel** — available `{key, example}` placeholders grouped per event.

**SettingMailProvider** — provider config: `fromAddress`, `replyToAddress`, `mailgun_mailDomain`, `mailgun_baseDomain`, `mailchimp_baseURL`, `slack_webhookURL`; `apiKey`/`webhookEndpointSecret` are write-only inputs.

**MailLog** (Prisma only) — per-recipient send record with `state: MailLogState` (`submitted`, `accepted`, `delivered`, `deferred`, `bounced`, `rejected`), `mailIdentifier`, `mailTemplateId`.

**Mailchimp sync types** — `MailchimpList`, `MailchimpMergeField`, `MailchimpInterestGroup`, `MailchimpSyncDryRunResult`, `MailchimpSyncProgressType`.

## Key queries & mutations
- `mailTemplates`, `mailTemplate(id)`, `mailTemplatePlaceholders`, `provider: MailProviderModel!` — `CanGetMailTemplates`
- `createMailTemplate` — `CanCreateMailTemplates`; `updateMailTemplate` — `CanUpdateMailTemplates`; `deleteMailTemplate` — `CanDeleteMailTemplates`; `syncTemplates` — `CanSyncMailTemplates`
- `systemMails` — `CanGetSystemMails`; `updateSystemMail(event!, mailTemplateId!)` — `CanUpdateSystemMails`; `testSystemMail(event!)` — `CanTestSystemMails`
- `mailProviderSetting(s)` / `updateMailProviderSetting(...)` — settings module (admin)
- Mailchimp sync: `mailchimpLists`, `mailchimpMergeFields`, `mailchimpInterestGroups`, `mailchimpSyncProgress`, `mailchimpSyncErrors`, `dryRunMailchimpSync`, `triggerMailchimpSync`, `deleteMailchimpSyncError(s)` — all `CanRunMailchimpSync`
- Webhook: HTTP controller at `mail-webhooks` (`@Public()`) receives provider delivery events into MailLog.

## Permissions
All GraphQL operations are admin-gated with the `Can…MailTemplates`, `Can…SystemMails`, `CanRunMailchimpSync` constants. Only the inbound webhook controller is `@Public()`.

## Gotchas
- Template HTML lives at the mail provider, not in the DB — local `MailTemplate` rows only hold `externalMailTemplateId`; `syncTemplates` pulls the remote list and flags `remoteMissing` for deleted ones.
- The Slack "mail" provider posts to `slack_webhookURL` and is implemented in the example app (`apps/api-example/src/app/slack-mail-provider.ts`), not in `libs/mail` — core lib ships Mailgun, Mailchimp, and Fake providers.
- `MailProviderType.SLACK` exists in both SDL and Prisma enums despite the app-level implementation.
- System mails are keyed by a unique `UserEvent` — there is exactly one template slot per event.

## Sources
- `apps/api-example/schema-v2.graphql`
- `libs/api/prisma/schema.prisma`
- `libs/mail/api/src/lib/{mail-provider/,mail.webhook.ts}`
- `libs/membership/api/src/lib/{mail-template,system-mail,mailchimp-sync}/`
