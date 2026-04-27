# Onboarding Workflow

Onboarding should become a gated workflow for each media, not a one-off thread and not a single prompt that tries to do everything.

## Goal

Make media setup repeatable without hiding the sensitive parts. Hermes should help collect state, check readiness, draft setup reports, scaffold knowledge-base pages, and propose CMS actions. Humans approve sensitive data handling and live CMS changes.

## Operating Shape

Onboarding is both:

- a structured form that captures business and setup inputs
- a skill with preflight checks and human gates
- a local script for deterministic scaffolding and validation
- CMS MCP for authenticated live reads and approved writes

The local script should not perform production setup by itself. It should create files, check required fields, and produce reports. Live CMS state belongs behind CMS MCP.

## Media Folder

Each media should have its own knowledge-base folder.

```text
05-media/
  {media}/
    profile.md
    design.md
    setup-state.md
    stakeholders.md
    payment-setup.md
    subscription-plans.md
    support-history.md
    decisions.md
    onboarding-report.md
```

`design.md` should be media-specific. It should capture brand, audience, editorial model, page structure, navigation, design constraints, and any custom setup decisions that matter to future support or development.

## Intake Form

The onboarding form should capture structured state, not credentials.

Required fields:

- media name
- primary contacts and roles
- target launch date
- CMS environment
- domain and branding state
- design assets status
- subscription model
- payment provider choice
- membership plans
- newsletter or mailing setup
- peering requirements
- migration/import needs
- stakeholder approvals

Sensitive fields:

- payment credentials
- API keys
- private member data
- contracts
- bank details
- personal contact details beyond required business contacts

Sensitive fields should be routed to authenticated systems and should not be stored in the knowledge base. The KB can store status and decisions, not secrets.

## Skill Gates

The `onboarding-triage` or `newsroom-setup-preflight` skill should enforce gates before setup progresses.

### G0: Identity And Access

- media identified
- requester role known
- environment known
- CMS access confirmed
- required stakeholders listed
- missing approvals listed

### G1: Media Design

- `design.md` exists
- brand assets linked
- domain and navigation decisions captured
- custom setup needs documented
- unresolved design decisions marked

### G2: CMS Setup State

- CMS MCP read tools can access the media
- setup status generated
- payment/subscription/member-plan readiness checked
- navigation/domain/branding checked
- peering checked if relevant

### G3: Payments And Subscriptions Approval

- payment provider choice confirmed
- plan names and prices approved
- taxes/currency/terms clarified
- human approval recorded before write actions
- credentials handled only through the approved secure path

### G4: Launch Readiness

- onboarding report generated
- blockers assigned in Linear
- support handoff created
- media setup-state page updated
- unresolved risks listed

## Local Script

A local setup script is useful, but it should be narrow.

Allowed script responsibilities:

- create the media folder
- create markdown templates
- validate required frontmatter
- check that required pages exist
- generate a missing-information report
- produce a dry-run summary

Disallowed script responsibilities:

- storing credentials
- transmitting sensitive data
- changing production CMS state
- editing payment configuration
- creating subscriptions or member plans without CMS MCP approval flow

Example command shape:

```bash
./scripts/create-media-onboarding.sh "{media-slug}"
```

The script output should be a checklist, not a completed setup claim.

## CMS MCP Use

CMS MCP is the right layer for live CMS state and approved setup actions because it can carry authentication, tenant scope, role checks, dry-run behavior, and audit logs.

Read phase:

- get site profile
- get setup status
- check payment setup
- check subscription setup
- check member plans
- check peering status
- check navigation/domain/branding
- generate onboarding report

Write phase, later:

- update basic site settings
- update payment settings
- create or update member plans
- update navigation
- apply an onboarding step

Every write action must include:

- media tenant scope
- human approval reference
- dry-run result
- before/after summary
- audit log entry

## Linear Use

Hermes should create Linear issues for onboarding blockers and engineering tasks.

Issue categories:

- missing media information
- design decision needed
- CMS setup blocker
- payment setup blocker
- subscription plan setup
- peering setup
- migration/import work
- product bug
- developer task
- launch-readiness risk

Each issue should link back to the media setup-state page and the relevant source thread.

## Human Gates

Human approval is required before:

- transmitting sensitive setup data
- entering credentials anywhere
- changing payment or subscription configuration
- applying CMS write tools
- confirming launch readiness to a media
- closing onboarding as complete

Hermes should prepare the decision, evidence, and draft action. A human should approve.

## Concrete Example

Request: A new media needs a paid membership setup before launch.

Expected Hermes path:

1. Form captures media, stakeholders, launch date, payment provider choice, and desired plans.
2. Local script creates the media KB folder and missing templates.
3. `onboarding-triage` checks gates G0-G3.
4. Hermes calls CMS MCP read tools to generate setup status.
5. Hermes drafts an onboarding report with blockers and next actions.
6. Hermes creates Linear issues for missing approvals or engineering work.
7. Human approves any payment/subscription write action.
8. CMS MCP performs approved write with audit log.
9. Hermes updates setup-state, decisions, and support handoff pages.

