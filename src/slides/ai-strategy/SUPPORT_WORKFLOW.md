# Support Workflow

Support should run through Slack or Linear, but neither should be treated as durable truth. Hermes should convert support conversations into structured triage, drafts, tracked work, and knowledge-base updates.

## Goal

Reduce repeated manual support work while keeping humans in control of external replies, media-visible decisions, and CMS mutations.

The support workflow should help We.Publish answer media quickly, identify recurring problems, create useful Linear issues, and turn resolved cases into reusable support patterns.

## Operating Shape

Support is a form plus a skill plus controlled tools.

- The form captures structured intake.
- The `support-triage` skill controls the reasoning path.
- The knowledge base is checked before live tools.
- CMS MCP is used for read-only diagnostics by default.
- Linear is used when work must be tracked.
- Hermes drafts, but a human approves and sends.

## Intake Form

The intake form can be embedded in Slack, linked from Linear, or implemented as a small internal page. It should not be a generic prompt box.

Required fields:

- media name
- requester name and role
- CMS URL or environment
- problem category
- urgency
- affected workflow
- expected behavior
- actual behavior
- screenshots or links
- whether the issue blocks publishing, payments, subscriptions, onboarding, or peering

Optional fields:

- browser/device details
- article/page/member/subscription identifier
- reproduction steps
- related Slack thread
- related Linear issue
- whether the requester has already checked public docs

Sensitive fields should be avoided. If a field might contain credentials, payment details, private member data, or personal information, the form must label it and route it to the correct authenticated system instead of storing it in the knowledge base.

## Skill Preflight

The `support-triage` skill should perform these checks before drafting an answer:

1. Classify the request.
2. Identify the media and environment.
3. Detect sensitive data or risky instructions.
4. Search the knowledge base for an existing support pattern.
5. Check the media setup-state page if the issue is media-specific.
6. Decide whether live CMS state is needed.
7. Decide whether a Linear issue is needed.
8. Draft the response with confidence and citations.
9. Propose a knowledge-base update after resolution.

The skill should explicitly mark one of these outcomes:

- answer from KB
- answer from KB plus public docs
- needs CMS MCP read diagnostic
- needs Linear engineering issue
- needs human clarification
- needs human approval before sensitive data handling
- blocked by missing access or missing media context

## CMS MCP Use

CMS MCP should be used only when live state matters. It should not be a generic GraphQL escape hatch.

Allowed default support diagnostics:

- `cms_get_site_profile`
- `cms_get_setup_status`
- `cms_check_payment_setup`
- `cms_check_subscription_setup`
- `cms_check_member_plans`
- `cms_check_peering_status`
- `cms_check_navigation_domain_branding`
- `cms_generate_onboarding_report`

Default support runtime should be read-only. Write tools require explicit human approval, tenant scope, dry-run output, and audit logging.

## Linear Escalation

Hermes should create or update a Linear issue when:

- the issue needs engineering work
- the issue blocks a media launch
- a bug is reproducible
- a CMS configuration decision is needed
- a payment/subscription setup problem cannot be resolved by known runbooks
- the same support pattern appears repeatedly
- the answer requires product or architecture clarification

Linear issue template:

```markdown
## Summary

## Media / Environment

## User Impact

## Evidence

## CMS MCP Diagnostics

## Knowledge Base Context

## Suspected Cause

## Proposed Next Step

## Acceptance Criteria

## Links
```

## External To Internal Loop

For media-facing support, Hermes should create and maintain tickets when the request becomes tracked work.

Loop:

1. Media asks in Slack, Linear-backed support, or a form.
2. Hermes classifies the request and checks for sensitive data.
3. Hermes searches KB and media history.
4. Hermes calls CMS MCP read diagnostics if live state matters.
5. Hermes creates or updates a Linear ticket.
6. Hermes enriches the ticket with KB context, CMS diagnostics, relevant skill files, Context7 library docs when needed, Firecrawl-fetched docs/site findings when needed, and Developer Context MCP code/docs references.
7. Hermes drafts a support reply, developer brief, docs fix, or draft PR proposal.
8. Human reviews and approves external reply, CMS write, or PR merge.
9. Hermes proposes KB and support-history updates after resolution.

## Human Gates

Human approval is required before:

- sending support replies externally
- transmitting sensitive data
- requesting or handling credentials
- changing CMS configuration
- editing payment, subscription, member plan, or peering settings
- creating a media-visible commitment
- closing a Linear issue as resolved

Hermes can draft all of these artifacts, but should not finalize them without a human.

## Knowledge Base Update

After resolution, Hermes should propose one or more KB updates:

- support pattern
- media support history
- media setup-state change
- runbook correction
- public docs gap
- Linear issue summary
- unresolved product decision

Support KB pages should include a compiled truth section at the top and an append-only timeline with source links at the bottom.

## Concrete Example

Request: A media says paid memberships are not appearing correctly.

Expected Hermes path:

1. Intake form captures media, environment, issue category, urgency, screenshots, and affected member plan.
2. `support-triage` identifies this as subscriptions/payments.
3. Hermes searches KB for known subscription setup patterns.
4. Hermes checks the media setup-state page.
5. Hermes calls CMS MCP read tools for payment setup, subscription setup, and member plans.
6. Hermes drafts a Slack reply with the likely cause and next requested clarification.
7. If engineering is needed, Hermes creates a Linear issue with diagnostics.
8. Human reviews and sends.
9. After resolution, Hermes proposes KB updates.
