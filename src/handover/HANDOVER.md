# Handover — Aldus / Hermes support gateway

Date: 2026-06-11 · Author: Tom Vaillant (departing contractor) · Contact: tom@buriedsignals.com
Scope: the AI support/knowledge stack — Aldus (Hermes runtime) on `hermes01`, the knowledge
engine plan (RAGFlow on `onyx01`), the CMS MCP, and the open PRs.

## What is running today

| Piece | State |
|---|---|
| **Aldus** — Hermes agent v0.16.0, profile `internal` | ✅ live on `hermes01.wepublish.cloud`, terminal chat works |
| LLM | ✅ `anthropic/claude-sonnet-4.6` via OpenRouter (key in profile `.env`, chmod 600) |
| Slack gateway | ✅ running (`hermes-gateway-internal.service`, systemd, boot-enabled), connected via Socket Mode |
| Slack app scopes/events | ⏳ **blocker** — app has 2/14 scopes; apply `aldus-slack-manifest.json` (App Manifest → paste → reinstall). See `aldus-slack-setup.html`. |
| Channel allowlist | ⏳ pin `#dev-aldus` + `#support-aldus` IDs in `SLACK_ALLOWED_CHANNELS` once scopes exist (until then Aldus answers in any channel it is invited to; all workspace users are allowed) |
| `kb-ingest` skill | ✅ installed **and live** — RAGFlow wired, full ingest path validated 2026-06-11 |
| `kb-retrieve` skill | ✅ built + deployed to the `internal` profile (PR #46) — scoped read mirror of kb-ingest; validated end-to-end |
| RAGFlow (knowledge engine) | ✅ **deployed 2026-06-11** on `onyx01` (16 GB): v0.25.6 headless, datasets `public` / `internal` / `newsroom:pilot` (empty — ingestion deliberately deferred), `bge-m3` via TEI sidecar, built-in MCP server on loopback :9382. See `../knowledge-engine/README.md` for how to use it. |
| Hermes → RAGFlow wire | ✅ systemd `ragflow-tunnel.service` on `hermes01` (restricted-key SSH tunnel → onyx01 loopback :9380/:9382); `RAGFLOW_*` env in the internal profile |
| CMS MCP | ✅ merged into `labs/wepublish-cms-mcp/` (PR #43) — mock-tested only, needs live validation against a real deployment |
| Upstream PRs | ⏳ open, do not self-merge: wepublish/wepublish **#2801** (token `roleIDs` — unblocks CMS MCP auth) and **#2802** (`llms.txt`) |

## Operating the box

```bash
ssh root@hermes01.wepublish.cloud          # key-based

hermes -p internal chat                     # talk to Aldus in the terminal
systemctl status hermes-gateway-internal    # gateway status
journalctl -u hermes-gateway-internal -f    # live logs
systemctl restart hermes-gateway-internal   # after any .env/config change

# Config + secrets live in /root/.hermes/profiles/internal/
#   .env        OPENROUTER_API_KEY, SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_ALLOW_ALL_USERS
#   config.yaml model, platform settings
#   SOUL.md     Aldus's identity (source of truth: labs/src/hermes/profiles/internal/)
#   skills/     kb-ingest

hermes -p internal config set model.default <model>   # change model
# Rotate a key: edit .env, then restart the service.
```

Hermes runtime: <https://github.com/NousResearch/hermes-agent> (install: pip from repo into
`/opt/hermes-py313`, a uv-managed Python 3.13 — system 3.14 is too new for it).

## Critical path to full operation

1. **Slack**: apply the manifest, reinstall the app, invite `@Aldus` to both channels →
   then pin the two channel IDs in `SLACK_ALLOWED_CHANNELS` and restart.
2. ~~Resize `onyx01` + deploy RAGFlow~~ — **done 2026-06-11** (see `../knowledge-engine/README.md`).
3. **Index** public docs + `llms.txt` into `public` (the wire and skills are live;
   only the content pull remains — deliberately deferred until after MCP/Hermes validation,
   which passed 2026-06-11).
4. **Merge #2801**, mint a scoped read-only token, validate the CMS MCP's two gated tools
   live, deploy it internal-only, add it to Aldus's `mcp_servers`.
5. **First newsroom pilot** (routing revised 2026-06-11 — one Slack app means one
   gateway, so **Aldus serves all channels**; per-newsroom profiles are superseded, see
   `../hermes/README.md`): create the newsroom's private channel + RAGFlow dataset, add
   a `RAGFLOW_CHANNEL_MAP` entry to the skills (own dataset only, forced
   `newsroom-asserted/unverified` tags), fold the `support-template` wording into the
   SOUL, and pass the isolation probes. **Prerequisites to build first:** channel-map
   support in `kb-retrieve`/`kb-ingest`, and the upstream hermes-agent contribution that
   injects the trusted Slack channel ID into the skill execution env (without it,
   channel scoping rests on the model relaying the channel ID — not acceptable as a
   security boundary). Also restrict profile memory from storing newsroom facts.

## Suggested tasks for Aldus (roadmap)

### GitHub integration — issues now, PRs next

**Issues (read + create) — recommended first.** Aldus turns support requests from Slack
into well-formed GitHub Issues (and reads existing ones to avoid duplicates and answer
"is this known?"). Setup:

- Create a **fine-grained PAT** (or GitHub App) scoped to **selected repositories only**,
  permissions: `Issues: read/write`, `Metadata: read`. Nothing else.
- Put it in the profile `.env` (e.g. `GITHUB_TOKEN`) and set `GITHUB_ISSUES_REPO`.
- Aldus's SOUL already requires it to **show the draft issue in the channel before filing**.

### Repository write access for PR creation (no merge rights)

Goal: Aldus can push branches and open PRs — doc fixes, `llms.txt` refreshes, support-pattern
write-ups, small triage-derived patches — but **can never merge, approve, or validate a PR**.

- Extend the fine-grained PAT with `Contents: read/write` + `Pull requests: read/write`
  on the **selected repos only**.
- **Important guardrail:** GitHub has no "can open PRs but not merge" permission — write
  access implies merge ability unless the branch is protected. So on every repo Aldus can
  write to, enable **branch protection on `main`: require ≥1 approving review** (and do
  not add the bot as a reviewer/CODEOWNER). That makes merging mechanically impossible
  for the bot, not just forbidden by prompt.
- Aldus's SOUL boundary ("no PR merges") stays as the second layer; the branch protection
  is the one that actually enforces it.
- Audit: PRs/issues created by the bot are attributable to its token identity.

### Other suggested tasks (rough order)

1. **Doc-scrape cron** — scheduled Hermes cron job: scrape docs.wepublish.ch / GitBook →
   `kb-ingest` into `public`/`internal` (the only recurring ingestion needed).
2. ~~Scoped retrieval skill~~ — **built (`skills/kb-retrieve/`, PR #46) and validated**.
3. **Weekly maintenance loop** — review escalations, convert resolved cases to support
   patterns (via `kb-ingest`), flag stale chunks, promote reviewed items (`--reviewed-by`).
4. **Hardening** — run the gateway as a dedicated `hermes` user instead of root
   (`/root/.hermes` → `/home/hermes/.hermes`, reinstall service with `--run-as-user hermes`);
   remove the dead `/opt/hermes-venv`; strip the OpenRouter key from the unused default
   profile (`/root/.hermes/.env`).
5. **Backups** — snapshot `hermes01` (profiles + env) and, once RAGFlow runs, `onyx01`
   (index, MySQL, MinIO); test one restore before the newsroom pilot.
6. **Slash commands + bot rename** — happen automatically if the manifest is applied;
   otherwise revisit.
7. **Model/cost review** — sonnet-4.6 is the internal default; decide the support-profile
   model (template currently haiku-4.5) when the first newsroom goes live.

## Hard boundaries (do not relax)

- Newsrooms never get RAGFlow access in any form — support profiles retrieve via the
  scoped skill only; isolation probes must pass before a newsroom profile goes live.
- KB writes only through `kb-ingest`; `confidence=confirmed` requires `--reviewed-by` (a human).
- Newsroom-asserted knowledge is never presented as We.Publish-verified.
- No CMS writes without dry-run + human approval + audit; agents never merge PRs.
- Secrets live in `chmod 600` `.env` files on the server — never in git.

## Pointers

- `labs/src/hermes/` — Hermes configuration: profiles, skills, README (architecture + decisions).
- `labs/src/knowledge-engine/` — KB access + ops documentation, `wp-kb` CLI.
- `aldus-slack-setup.html` / `aldus-slack-manifest.json` — Slack setup doc for the workspace admin.
- `labs/wepublish-cms-mcp/` — CMS MCP (README + `docs/staging-and-token.md`).
- Open PRs: wepublish/wepublish#2801, #2802.
- RAGFlow deploy scripts + engine bake-off evidence: handed over separately (`wp-knowledge/`).
