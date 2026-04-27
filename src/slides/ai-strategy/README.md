# We.Publish AI Strategy Deck Context

This directory contains the static slide deck for the We.Publish AI strategy and the written workflow context behind it.

The deck is intentionally short enough for leadership review. The markdown files preserve the operational detail needed by engineering, support, onboarding, and agent implementers.

## Files

- `index.html`: slide deck shown at `/slides/ai-strategy/`
- `SUPPORT_WORKFLOW.md`: concrete support workflow for Slack, Linear, Hermes, the knowledge base, and CMS MCP diagnostics
- `ONBOARDING_WORKFLOW.md`: concrete onboarding workflow for forms, skill gates, local scaffolding, CMS MCP checks, and human-approved setup actions
- `HERMES_AGENT.md`: concrete Hermes responsibilities for developers, the team, media support, onboarding, documentation health, and internal skill packs

## Strategic Position

The support and onboarding model is not a free-form chatbot and not a shell script that performs setup blindly.

It is a controlled workflow:

1. A form captures structured state.
2. A skill enforces preflight checks, sensitive-data rules, and human gates.
3. Local scripts create deterministic local artifacts only.
4. CMS MCP reads live CMS state and later performs narrow approved actions.
5. Hermes drafts replies, Linear issues, setup reports, and knowledge-base updates.
6. Humans approve external replies, media-visible changes, sensitive-data transmission, CMS mutations, and PR merges.

This keeps the knowledge base useful without turning it into a store for credentials, payment secrets, or live production configuration.

## Source Of Truth

For the 60-day rollout, the Git-backed knowledge base remains the durable source of truth. Slack is conversation. Linear is tracked work. CMS MCP is live operational state. Developer Context MCP is internal code and docs context.

The workflow specs here should later be copied into the knowledge base under:

```text
wepublish-brain/
  03-product-cms/
    setup/
    payments/
    troubleshooting/
  04-developers/
    mcp/
    runbooks/
  06-issues/
    support-escalations/
    resolved-patterns/
```
