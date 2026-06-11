# Ticket & PR conventions — support → developer routing

Distilled from HERMES_SUPPORT_CHAT_SPEC + HANDOVER (labs/src/). Phase-1 tracker: **GitHub Issues**.

## When a support request becomes a ticket

Create (or enrich) a GitHub Issue when the request: needs engineering work, blocks publishing / onboarding / payments / launch, repeats an existing pattern, requires an approval, or is a change request.

## Issue content (every ticket)

- **Newsroom** + requester + Slack workflow/thread reference
- **Urgency** and what it blocks
- The original request, verbatim or tightly summarized
- **KB citations** consulted (with confidence) + CMS MCP diagnostics if run
- Related known patterns / previous issues
- Reproduction steps where applicable
- Proposed owner + acceptance criteria

The draft is shown in the Slack channel before filing. Resolved tickets feed back into the KB as reviewed `support_pattern` chunks (human-reviewed before `confirmed`).

## PR conventions (when Hermes opens PRs)

Allowed PR scope: documentation fixes, `llms.txt` refreshes, support-pattern write-ups, small triage patches. Requirements:

- Follow the monorepo conventions (see "Code conventions for contributions – wepublish repo" in the KB: conventional commits, Nx structure, prettier/eslint).
- Branch from `development` (the default branch of wepublish/wepublish); never push to protected branches.
- PR description: problem, change, test evidence, link to the originating issue/thread.
- **Never merge** — a human reviews and merges; branch protection makes this mechanical.

## Access model

GitHub access = fine-grained PAT: Issues read/write + Metadata (tickets), plus Contents + Pull-requests read/write on selected repos only (PRs). All actions are attributable to the bot identity.
