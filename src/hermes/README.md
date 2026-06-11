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

## Architecture

- **One Slack app ⇒ one gateway ⇒ one Slack-facing profile.** (Routing decision,
  2026-06-11.) Slack Socket Mode load-balances events across all open connections from
  one app, so two Hermes gateways sharing the app would receive messages at random; and
  multiple Slack apps are ruled out. Therefore the **`internal` profile (Aldus) serves
  every Slack channel** — staff channels now, newsroom channels later. The earlier
  one-profile-per-newsroom design is superseded.
- **Newsrooms never touch RAGFlow in any form** — no login, no MCP, no API. They talk to
  Aldus in **their dedicated Slack channel**; scoping happens per channel (below).
- **Per-channel scoping (newsroom phase):** the `kb-retrieve`/`kb-ingest` scripts gain a
  channel→dataset map (`RAGFLOW_CHANNEL_MAP` env: channel ID → readable datasets,
  writable dataset, forced tags). The map is enforced in code. The channel ID itself
  must come from a **trusted source**: an upstream `hermes-agent` contribution that
  injects the Slack channel ID into the skill execution env (the runtime already has
  env-passthrough machinery; this extends it). Until that lands, the model relays the
  channel ID — acceptable for staff channels, not for newsroom isolation.
- **Memory:** Hermes persistent memory (`MEMORY.md`) is profile-global, i.e. shared
  across channels. Before any newsroom channel goes live: restrict the memory tool so
  newsroom-specific facts are never stored in profile memory (they belong in the KB,
  tagged) — and verify via isolation probes.
- **Ingest is chat-driven and IT-owned** via the hardened `kb-ingest` skill (below).
  Scheduled scrapes (cron) come later and are run separately by IT.
- **Tracker = GitHub Issues for now** (simplification, 2026-06-11; replaces the
  Jira-now/Linear-later plan). Swapping tracker later = swapping the routing skill.
- Developer/coding-agent access to the KB (RAGFlow MCP with dev tokens): **deferred**.

## Surfaces (all served by the `internal` profile / Aldus)

| Surface | Channels | Knowledge scope | Tools |
|---|---|---|---|
| Staff / devs | `#dev-aldus`, `#support-aldus` | `public` + `internal` + all newsroom datasets | `kb-retrieve`, `kb-ingest` (all datasets), CMS MCP, wepublish-mcp, GitHub Issues |
| Newsroom (phase 2) | one dedicated channel per newsroom | `public` + `newsroom:<slug>` only, via the channel map | `kb-retrieve`/`kb-ingest` (channel-mapped: own dataset, tags forced), read-only CMS MCP (their deployment), GitHub Issue drafting |

`profiles/support-template/` is **retained for its editorial wording** (newsroom tone
rules, cooperation talking points) — at the newsroom phase that content folds into the
unified SOUL as channel-conditional behavior. It is no longer instantiated as separate
profiles.

## Knowledge flow (garbage-in rule, operationalized)

1. Newsroom shares knowledge in their channel → Aldus ingests it **immediately** via
   `kb-ingest` — the channel map **forces** `source=newsroom-asserted,
   confidence=unverified` and restricts the writable dataset to that newsroom's own.
   The data is useful right away; it is never presented as We.Publish-verified.
2. IT reviews unverified chunks (weekly maintenance) and promotes from a staff channel —
   `confidence=confirmed` is only accepted by the script with an explicit
   `--reviewed-by <human>`.
3. The scripts (`skills/kb-ingest/push_chunk.py`, `skills/kb-retrieve/query.py`) enforce
   all of this **in code**, not in the prompt: dataset allowlist, required tags, forced
   tags, fail-closed.

## Isolation model (layered)

RAGFlow API keys are **tenant-wide, not dataset-scoped**, so isolation is enforced above
the engine:

1. **Skills enforce dataset allowlists in code** — today profile-wide
   (`RAGFLOW_ALLOWED_DATASET_IDS`); newsroom phase: per-channel via `RAGFLOW_CHANNEL_MAP`.
2. **Trusted channel identity** — the upstream hermes-agent env-injection contribution is
   what makes the map deterministic instead of model-relayed. Build it before the first
   newsroom channel.
3. **Memory restrictions** — no newsroom facts in profile-global memory.
4. **Acceptance gate:** isolation probes (ask in newsroom A's channel for newsroom B
   content → must return "not found") before any newsroom channel goes live.

## Deployment (hermes01)

1. Resize `hermes01` to ≥ CPX31 (4 vCPU / 8 GB).
2. Install Hermes; `hermes profile create internal`; copy `profiles/internal/` contents
   into `~/.hermes/profiles/internal/`, fill `.env`, `internal setup`,
   `internal gateway install`, `internal gateway start`.
3. Per pilot newsroom: create their private channel, invite `@Aldus`, add the channel to
   `SLACK_ALLOWED_CHANNELS`, add a `RAGFLOW_CHANNEL_MAP` entry (+ their RAGFlow dataset),
   fold the support-template wording into the SOUL, run the isolation probes.
4. Pilot order per the support spec: internal-only first → one newsroom → (optional)
   public docs surface.

## What is deliberately NOT here

- **RAGFlow deploy + ops** — `src/knowledge-engine/` (deployed 2026-06-11 on `onyx01`).
- **CMS MCP** — `labs/wepublish-cms-mcp/` (merged, mock-tested; needs live validation).
- **Secrets** — every profile dir has `.env.example` only.
- **Next builds** — channel-map support in the two skills + the upstream hermes-agent
  channel-ID env injection (prerequisites for newsroom channels); doc-scrape cron;
  GitHub Issue routing skill.
