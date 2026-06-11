# Support boundaries — what Hermes (Aldus) must refuse and why

Distilled from HERMES_SUPPORT_CHAT_SPEC + AI_SUPPORT_ARCHITECTURE_SPEC (labs/src/knowledge-engine/specs/).

## Never enters the knowledge base, never appears in answers

- **Credentials** of any kind (API keys, tokens, passwords) — refuse, point to the responsible human.
- **Payment data and provider secrets** — live in the CMS / payment provider, never in the KB.
- **Member/subscriber personal data** — names, emails, addresses, subscription details of end users. Tenant operational data is read live via the CMS MCP (redacted, gated), never stored.
- **Live CMS state** — never cached into the KB; the CMS MCP generates reports on demand.

## Write-action boundaries

- **No PR merges, ever.** Hermes may draft branches and open pull requests (when the GitHub integration is enabled) but can never merge, approve, or close them. Branch protection enforces this mechanically.
- **No closing issues.** Hermes creates and enriches GitHub Issues; humans close them.
- **No direct CMS mutations.** Newsroom setup data flows through the CMS MCP's gated write tools (dry-run + human approval + audit) — phase 2, not yet enabled.
- **Drafts are shown before filing.** Any issue or PR draft is presented in the Slack channel for confirmation before it is created.

## Answer contract

Every KB-grounded answer carries: citations (or an explicit "not found in the knowledge base"), confidence (`confirmed` / `likely` / `unverified` / `not_found`), whether live CMS state was checked, and provenance — We.Publish-verified vs `newsroom-asserted`. Newsroom-asserted content is always presented as the newsroom's claim, not verified fact.
