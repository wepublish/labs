# Repo home & staging endpoint — decisions

Two questions that get conflated. They are separate.

## 1. The staging endpoint is NOT a repo

The "endpoint" to validate the CMS MCP against is a **running We.Publish instance**,
not a git artifact. You do not create a repo for it and you do not PR anything to
get it. We.Publish is fully open and ships prebuilt images, so the smallest-effort
path is to run *their* stack locally:

```bash
git clone https://github.com/wepublish/wepublish
cd wepublish && docker compose up   # api (wepublishch/api:master) + postgres:17 + editor + media + minio
```

That gives:
- admin **GraphQL at `/graphql`** → point `WEPUBLISH_API_URL` at it,
- the **editor UI** → seed a test tenant (payment methods, member plans, navigations, peers),
- a real surface to confirm the admin **auth** flow, the **tenant-scope header**
  (`TENANT_HEADER` placeholder in `src/client.ts`), and that each operation's
  selected fields match the running server.

Footprint is small (~1–2 GB) — runs on the current small box or locally. This is
**independent of the RAGFlow resize**. No We.Publish permission, no PR, no new repo.

A thin reproducible `staging/` (a compose referencing their images + a seed script
+ a validation run of all 8 tools) can live in *this* repo so it's one command.

## 2. Where the CMS MCP code lives

**Best practice: its own standalone repo. Do NOT PR it into the wepublish monorepo.**

The CMS MCP is a *downstream consumer* of the public GraphQL API — like a client
library or an integration. It has its own deps (MCP SDK), its own release cadence,
and never needs to live inside the CMS codebase. PR-ing it into the monorepo is the
**highest-effort, worst-fit** option: large review surface, the CTO must accept and
maintain it, and it couples your releases to theirs.

Smallest effort + you keep control:

- Keep it standalone (it already is). Push to the **`buriedsignals`** org as
  `wepublish-cms-mcp` — it's your deliverable, you maintain it, MIT/Apache so
  We.Publish can adopt it freely.
- If/when the We.Publish CTO wants the org to own it, **transfer the repo** to the
  `wepublish` org (one-click GitHub transfer) or they fork. No code churn.

**When a monorepo PR *is* right:** only for changes to We.Publish itself — e.g. a
later `llms.txt` in their site app, or a new GraphQL field you need. Not for this
server.

### Recommendation
1. Endpoint: run their public `docker compose` (no repo, no PR). Add reproducible `staging/` here.
2. MCP home: standalone repo under `buriedsignals`; offer transfer to `wepublish` if the CTO adopts it.
3. Monorepo PR: no.
