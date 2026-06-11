# We.Publish `llms.txt` and `llms-full.txt` Spec

Status: draft for review
Date: 2026-05-27

## Decision

Publish public agent context files for We.Publish:

- `/llms.txt`
- `/llms-full.txt`

Destination:

- source repository: `https://github.com/wepublish/wepublish/tree/development/apps/wepublish-site`
- deployed URLs: `https://wepublish.ch/llms.txt` and `https://wepublish.ch/llms-full.txt`

These files are not the internal knowledge base. They are public entry points for agents, search tools, and developers that need a concise map of We.Publish public documentation.

## Goals

The public context files should:

- make public We.Publish docs easier for AI agents to discover
- reduce hallucinated answers about the CMS, Website Builder Framework, publisher docs, and support paths
- point agents to canonical docs and public repositories
- clarify what is not public and must go through authenticated support
- provide a clean source for the engine's public-namespace indexing

## Non-goals

The files must not include:

- private media setup
- internal strategy
- Slack or Linear content
- private support history
- payment secrets
- member data
- credentials
- private GitHub repository content
- live CMS tenant state

## `/llms.txt`

Purpose:

- short map for agents
- links to canonical public docs
- support/onboarding entry points
- boundaries

Required sections:

```markdown
# We.Publish

> Public context for AI agents and search tools.

## What We.Publish Is

## Canonical Documentation

## Publisher Documentation

## Developer Documentation

## Website Builder Framework

## API and GraphQL

## Support and Onboarding

## Public Repository

## Boundaries

## Last Updated
```

Required links:

- We.Publish website
- public docs homepage
- publisher documentation
- developer documentation
- Website Builder Framework overview
- API/client docs
- public GitHub repository
- support/onboarding contact route

## `/llms-full.txt`

Purpose:

- compact public knowledge pack for agents
- still public, still source-linked
- useful for public docs support and developer onboarding

Required sections:

- overview of We.Publish CMS
- publisher concepts
- editor/navigation/logo basics
- payment/subscription/member-plan concepts where public
- peering concepts where public
- Website Builder Framework overview
- API/client overview
- common public troubleshooting paths
- support escalation path
- boundaries and private-data rules
- source index

Length target:

- short enough to be fetched by agents without crawling the whole docs site
- long enough to answer common public questions
- source-linked, not a raw copy of every docs page

## Source Inputs

Initial source inputs:

- `https://docs.wepublish.ch/`
- `https://docs.wepublish.ch/developers/website-builder/framework-overview`
- `https://docs.wepublish.ch/developers/website-builder/api-client`
- `https://docs.wepublish.ch/developers/api`
- `https://docs.wepublish.ch/publisher-dokumentation/editor/navigation-and-logo`
- public We.Publish GitHub docs
- selected `wepublish.ch` pages

The Website Builder public docs describe a Next.js/MUI/Apollo GraphQL framework that consumes the We.Publish CMS API. The API-client docs describe Apollo Client usage, `/v1` API conventions, generated GraphQL hooks/documents, and environment configuration such as `API_URL`. Public support context should reference those public docs rather than invent implementation details.

## Generation Workflow

1. Fetch public source pages.
2. Extract stable public facts and canonical links.
3. Generate `/llms.txt`.
4. Generate `/llms-full.txt`.
5. Run private-data checks.
6. Human review.
7. Commit the reviewed files into `apps/wepublish-site` in the We.Publish repository.
8. Publish through the We.Publish website deployment.
9. Verify the deployed public URLs.
10. Index the published files into the engine's `public` namespace.

## Private-Data Checks

Reject generated files if they contain:

- private media names not intentionally public
- Slack URLs
- Linear internal URLs
- credentials or tokens
- payment/provider secrets
- personal member data
- internal strategy fragments
- private repository URLs
- staging tenant details

## Publishing Locations

Source destination:

- `https://github.com/wepublish/wepublish/tree/development/apps/wepublish-site`

Preferred:

- `https://wepublish.ch/llms.txt`
- `https://wepublish.ch/llms-full.txt`

Optional mirror:

- `https://docs.wepublish.ch/llms.txt`
- `https://docs.wepublish.ch/llms-full.txt`

## Refresh Cadence

- refresh weekly during rollout
- refresh after major docs changes
- refresh after major API/framework changes
- monthly freshness review after stabilization

## Interaction With The Engine

The engine should index these files into the `public` namespace. They help public chat and agents start from a curated map rather than scattered crawl results.

The engine must not treat these files as a substitute for full public docs indexing. They are context maps, not the entire source corpus.

## Interaction With Hermes

Hermes can use `/llms.txt` and `/llms-full.txt` when:

- answering public docs questions
- generating developer onboarding briefs
- helping agents discover the right public source
- explaining boundaries to users

Hermes must use the internal/newsroom namespaces and CMS MCP for private support and tenant-specific answers.

## Acceptance Criteria

- `/llms.txt` exists publicly.
- `/llms-full.txt` exists publicly.
- Reviewed source files live in `apps/wepublish-site` in the We.Publish repository.
- Both files link to canonical public docs.
- Both files state private-data boundaries.
- Neither file contains internal/private support information.
- The engine's `public` namespace includes both files.
- Public docs chat can cite public docs rather than internal documents.
