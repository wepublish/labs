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

## Next session: populate the KB (the actual remaining work)

- [ ] Index `llms.txt` / `llms-full.txt` + public docs → `public` dataset
      (wepublish/wepublish#2802 must be deployed for the live URLs; can also ingest
      from the repo files directly)
- [ ] Doc-scrape (docs.wepublish.ch / GitBook) → `public` / `internal`
- [ ] Seed `internal` with We.Publish operational knowledge (chat-driven via kb-ingest)
- [ ] Newsroom knowledge → `newsroom:pilot` (tagged `newsroom-asserted`/`unverified`)
- [ ] After first real content: spot-check retrieval quality (German + French queries)

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
