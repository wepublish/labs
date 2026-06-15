# KB — remaining todos (operational, Tom + agent)

Working checklist, separate from the handover artifact (`handover.html`, deployed at
`/labs/knowledge-engine/handover.html`).
Infrastructure is DONE and validated: engine, wire, skills, monitoring, backups.

## Slack manifest applied 2026-06-15 — integration verified, 2 human actions left

Manifest pasted + reinstalled by the CTO. Gateway verified live on hermes01.

- [x] Scopes 2 → 11 (DM-less set confirmed via `auth.test` x-oauth-scopes:
      chat:write, app_mentions:read, files:write, commands, channels:history/read,
      files:read, groups:history/read, im:read, users:read). Same bot B0B9SF92N30.
- [x] Gateway restarted, holds a live Socket Mode WebSocket to Slack (verified via `ss`);
      no `missing_scope` errors. `SLACK_ALLOW_ALL_USERS=true` set.
- [x] `#support-aldus` (C0B9R7CQU4V): bot is a member; pinned in `SLACK_ALLOWED_CHANNELS`;
      chat:write confirmed (posted liveness message).
- [x] Agent brain re-verified end-to-end via terminal: KB retrieval (4 real docs) +
      full answer contract (peering question → Confirmed, We.Publish-verified).
- [x] `#dev-aldus` (C0B9Y68V2DA) invited + pinned. Both channels now in
      `SLACK_ALLOWED_CHANNELS=C0B9R7CQU4V,C0B9Y68V2DA`.
- [x] Round-trip confirmed live in Slack (Tom interacted; Aldus responding).
- [x] Home channel set: `SLACK_HOME_CHANNEL=C0B9Y68V2DA` (dev-aldus) for cron/monitoring
      delivery — silences the "no home channel" prompt; no slash command needed.
- [ ] Off-allowlist behavior: a message/slash command in a non-allowed channel is ignored
      (test live with a throwaway channel — both real channels are now allowlisted).
- [ ] Verify the monitoring alert path posts: on hermes01,
      `echo critical > /opt/kb-watch/state && bash /opt/kb-watch/kb-watch.sh`
      → expect the ✅ recovery message in `#dev-aldus`

## Populate the KB (the actual remaining work)

Superseded by the full plan: **`specs/plans/2026-06-11-001-feat-kb-population-plan.md`**
(scope widened 2026-06-11: thorough repo/CMS/docs understanding, Hermes PR/ticket
context, per-newsroom implementation profiles for devs; GitBook ingested from its
backing repo instead of a scrape). Unit checklist:

- [x] U1 Data-structure amendment — DONE 2026-06-11 (deployed to hermes01, canary-validated)
- [x] U2 `kb-bulk` ingest tool — DONE (pagination bug found+fixed on first 100+-doc run)
- [x] U3 Public corpus → `public` — DONE: 110 docs (103 GitBook + llms.txt ×2 + 5 marketing)
- [x] U4 Repo/CMS knowledge → `public` — DONE: 15 docs, commit-tagged @7a2e66b
- [x] U5 API domain references → `internal` — DONE: 24 generated docs, SDL-verified
- [x] U6 Newsroom implementation profiles — DONE 2026-06-11: Tom approved the pilot
      format; all 17 newsroom apps profiled + ingested (`apps/wepublish-site` excluded —
      marketing site, not a newsroom; `bka` documented as a deployment-disabled stub)
- [x] U7 Internal ops seed → `internal` — DONE: 4 docs, reviewed by Tom 2026-06-11 →
      re-ingested as `confirmed`/`reviewed_by: tom`
- [x] U8 Retrieval eval — DONE: 30/32, public-answerable 96% (`ingest/eval-questions.md`);
      `vector_similarity_weight 0.7` adopted in kb-retrieve + wp-kb
- [x] U9 Bookkeeping — DONE (this file, kb-setup-log.json, README)
- [ ] Copy the reviewed bajour profile into `newsroom:bajour` when its channel goes live

## Before the first newsroom channel goes live (isolation prerequisites)

- [ ] `RAGFLOW_CHANNEL_MAP` (channel ID → read datasets / write dataset / forced tags)
      enforced in `kb-retrieve` + `kb-ingest`
- [ ] Upstream hermes-agent contribution: inject trusted Slack channel ID into skill
      exec env (without it the model relays the channel ID = prompt-grade only)
- [ ] Isolation probes pass (newsroom A cannot read newsroom B / internal)

## Smaller / later

- [ ] Doc-scrape cron (recurring ingestion; IT-owned)
- [ ] GH-issue routing skill (support → tracked GitHub Issue)
- [ ] Ship MySQL backups off-box (Hetzner Storage Box ~€4/mo; dumps currently rotate
      locally on onyx01 only)
- [ ] Optional: healthchecks.io UUID → `HEALTHCHECKS_URL` in
      `/opt/ragflow-deploy/watchdog.env` (email dead-man channel)
- [ ] Hardening: run the Hermes gateway as a dedicated user instead of root
- [ ] Gate A follow-ups when We.Publish merges them: #2801 (token roleIDs → mint scoped
      read-only token → validate CMS MCP gated **read** tools — payment/subscription
      **status** diagnostics for support — live; payment/setup **writes** go through the
      secure setup form, NOT the MCP), #2802 (verify live llms.txt)
- [ ] Memory-pressure fallback if ingestion strains the box: documented model swap in
      `README.md` (multilingual-e5-base) or CPX51 resize

## Suggested additions to complete the vision (roadmap — detail in `handover.html`)

- [ ] **Secure setup form** — single secure web page: a newsroom enters payment + setup
      details, validated and written correctly into their CMS DB. Sensitive structured
      data belongs in a deterministic form, never an LLM-composed write. Aldus assists
      around it (CMS MCP reads verify the result) but never performs the write.
- [ ] **Jira Share Board adapter** — developer-support loop: read to dedupe/answer
      "is this known/planned?", gated write to draft entries from support threads.
- [ ] **GitHub PAT** — Issues (read+create) first; PR creation later with branch
      protection as the hard no-merge guarantee.
