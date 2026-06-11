# Hermes — We.Publish support gateway

Profile configurations and skills for [Hermes](https://github.com/NousResearch/hermes-agent),
the agent runtime that serves as the We.Publish support/onboarding gateway. Hermes runs on
`hermes01.wepublish.cloud`; the knowledge engine (RAGFlow, headless) runs on `onyx01`.

This is **configuration, not an app** — there is no `index.html`, so the labs Vite build
ignores this directory. What lives here: one directory per Hermes profile (SOUL.md +
config.yaml + .env.example) and the shared skill set, versioned so the deployed profiles
on `hermes01` are reproducible.

## Why Hermes (decision record, 2026-06-11)

Previously open decision OD2 (standalone gateway vs. extending
`wepublish-ai-support-agent`) is resolved: **neither**. The Hermes runtime natively provides
everything that repo hand-rolled — Slack gateway (Socket Mode, channel allowlists,
threading), MCP client (stdio + remote URL with bearer auth, per-server tool policies),
multi-profile isolation, persistent memory, and cron. The only thing salvaged from
`wepublish-ai-support-agent` is its editorial system-prompt wording, now folded into
`profiles/support-template/SOUL.md`.

## Architecture (phase 1)

- **Two profile kinds, nothing else**: `internal` (one instance, staff/devs) and
  `support-<slug>` (one instance per newsroom, from `profiles/support-template/`).
- **Newsrooms never touch RAGFlow in any form** — no login, no MCP, no API. They talk to
  their support profile in **their dedicated Slack channel**; the profile retrieves on
  their behalf through the scoped retrieval skill.
- **One profile per newsroom** (not one shared support profile): Hermes memory, sessions,
  `.env`, and the gateway service are per-profile, so per-newsroom profiles give hard
  isolation of conversational memory — RAGFlow dataset scoping alone would not prevent
  newsroom A context surfacing in newsroom B answers through a shared profile's memory.
- **Ingest is chat-driven and IT-owned** via the hardened `kb-ingest` skill (below).
  Scheduled scrapes (cron) come later and are run separately by IT.
- **Tracker = GitHub Issues for now** (simplification, 2026-06-11; replaces the
  Jira-now/Linear-later plan). Support requests that need engineering are routed as
  GitHub Issues in the configured repo. Swapping tracker later = swapping the routing
  skill, nothing else.
- Developer/coding-agent access to the KB (RAGFlow MCP with dev tokens): **deferred**,
  not part of phase 1.

## Profiles ↔ surfaces

| Profile | Persona | Surface | Knowledge scope | Tools |
|---|---|---|---|---|
| `internal` | **Aldus**, the We.Publish librarian (after Aldus Manutius) | staff/dev Slack channels | `public` + `internal` + all newsroom datasets | RAGFlow MCP, CMS MCP, wepublish-mcp, `kb-ingest` (all datasets), GitHub Issues |
| `support-<slug>` | TBD per newsroom | that newsroom's dedicated channel | `public` + `newsroom:<slug>` via scoped retrieval skill | read-only CMS MCP (their deployment), `kb-ingest` (their dataset only, tags forced), GitHub Issues drafting |

## Knowledge flow (garbage-in rule, operationalized)

1. Newsroom shares knowledge in their channel → their support profile ingests it
   **immediately** via `kb-ingest` — but the profile's env **forces**
   `source=newsroom-asserted, confidence=unverified` and restricts the writable dataset
   to that newsroom's own. The data is useful right away; it is never presented as
   We.Publish-verified.
2. IT reviews unverified chunks (weekly maintenance) and promotes via the internal
   profile's `kb-ingest` — `confidence=confirmed` is only accepted by the script with an
   explicit `--reviewed-by <human>`.
3. The script (`skills/kb-ingest/push_chunk.py`) enforces all of this **in code**, not in
   the prompt: dataset allowlist, required tags, forced tags, fail-closed.

## Isolation model

RAGFlow API keys are **tenant-wide, not dataset-scoped**, so isolation is enforced at the
profile boundary:

- `internal` may use RAGFlow's MCP directly — it is allowed to see everything indexed.
- **Support profiles get no RAGFlow MCP.** Retrieval goes through a skill calling
  `/api/v1/retrieval` with that profile's `dataset_ids` pinned from its `.env`
  (retrieval skill: TBD, mirrors the kb-ingest pattern). Writes go through `kb-ingest`
  with the dataset allowlist + forced tags.
- Acceptance gate before any support profile goes live: isolation probes (newsroom A
  asking for newsroom B content) must return "not found".

## Deployment (hermes01)

1. Resize `hermes01` to ≥ CPX31 (4 vCPU / 8 GB).
2. Install Hermes; `hermes profile create internal`; copy `profiles/internal/` contents
   into `~/.hermes/profiles/internal/`, fill `.env`, `internal setup`,
   `internal gateway install`, `internal gateway start`.
3. Per pilot newsroom: `hermes profile create support-<slug>`, instantiate
   `profiles/support-template/` (replace `{NEWSROOM_NAME}`/`{SLUG}`), create their Slack
   channel, pin `SLACK_ALLOWED_CHANNELS` to it.
4. Pilot order per the support spec: internal-only first → one newsroom → (optional)
   public docs surface.

## What is deliberately NOT here

- **RAGFlow deploy** — separate deliverable (gated on the `onyx01` resize).
- **CMS MCP** — `labs/wepublish-cms-mcp/` (merged, mock-tested; needs live validation).
- **Secrets** — every profile dir has `.env.example` only.
- **Scoped retrieval skill + doc-scrape cron** — next builds; both follow the
  `kb-ingest` pattern (deterministic script owns the API call, prompt never composes it).
