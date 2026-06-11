# KB — remaining todos (operational, Tom + agent)

Working checklist, separate from the handover doc (`../handover/HANDOVER.md`).
Infrastructure is DONE and validated: engine, wire, skills, monitoring, backups.

## Blocked on the Slack manifest (CTO action)

The app manifest (`../hermes/slack/aldus-slack-manifest.json`) must be pasted into
the Slack app settings (App Manifest → paste → reinstall). One action unblocks all of:

- [ ] Bot renamed `demo_app` → **Aldus**; scopes 2/14 → full set
- [ ] Verify scopes after: `curl -D- -H "Authorization: Bearer $TOKEN" https://slack.com/api/auth.test` → `x-oauth-scopes` header
- [ ] Invite Aldus to `#dev-aldus` + `#support-aldus`
- [ ] Pin channel IDs in `SLACK_ALLOWED_CHANNELS` + set the user allowlist in the
      internal profile `.env` on hermes01; `systemctl restart hermes-gateway-internal`
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
- [ ] U6 Newsroom implementation profiles — **3/18: bajour, tsri, hauptstadt ingested;
      AWAITING TOM'S FORMAT/ACCURACY REVIEW** (`ingest/newsroom-profiles/`), then
      generate + ingest the remaining 15
- [x] U7 Internal ops seed → `internal` — DONE: 4 docs as `likely`; Tom review → re-tag
      `confirmed` (re-run with reviewed_by once read)
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
      read-only token → validate CMS MCP gated tools live), #2802 (verify live llms.txt)
- [ ] Memory-pressure fallback if ingestion strains the box: documented model swap in
      `README.md` (multilingual-e5-base) or CPX51 resize
