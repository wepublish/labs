# We.Publish AI stack — what runs where (orientation)

Distilled from AI_SUPPORT_ARCHITECTURE_SPEC + knowledge-engine README (labs/src/knowledge-engine/).

## Components

- **Knowledge engine: RAGFlow** (headless, retrieval-only — no chat LLM) on `onyx01.wepublish.cloud`. Datasets/namespaces: `public` (docs, llms.txt, marketing knowledge — visible to everyone), `internal` (dev/architecture knowledge, API references, newsroom implementation profiles, ops knowledge — internal tier), `newsroom:{slug}` (that newsroom's own knowledge, e.g. `newsroom:bajour`). Embeddings: bge-m3 (multilingual) via TEI sidecar. Everything loopback-bound; SSH is the security boundary.
- **Hermes (Aldus)** on `hermes01.wepublish.cloud` — the Slack support agent. Reads the KB via the `kb-retrieve` skill (dataset allowlist enforced in code), writes via `kb-ingest` (schema-on-ingest, fails closed). Generation = OpenRouter; RAGFlow only retrieves.
- **CMS MCP** (`wepublish-cms-mcp`) — read-only, redacted diagnostics against a newsroom's live CMS (gated tools blocked upstream until wepublish/wepublish#2801 lands).
- **Developer Context MCP** (`wepublish-mcp`, deployed at mcp.wepublish.cloud) — live GitHub/code lookup at HEAD. Raw source code is **never** embedded in the KB; derived prose (API references, implementation profiles) is, tagged with `commit` provenance.
- **KB access for IT/agents**: `wp-kb` CLI (health/query/ingest over SSH) and the retrieval-only RAGFlow MCP through an SSH tunnel. Newsrooms never touch RAGFlow in any form — they talk to Aldus in their Slack channel.

## Knowledge rules of thumb

- Public docs questions → `public` namespace (GitBook corpus + llms.txt are indexed there).
- "How does newsroom X implement Y" → `internal` implementation profiles (commit-tagged, machine-generated — verify against HEAD via the Developer Context MCP when precision matters).
- Live tenant state ("is bajour's payment setup complete?") → CMS MCP, never the KB.
- New knowledge in → `kb-ingest` only (schema enforced); raw dumps and unreviewed `confirmed` tags are refused.

## Monitoring

`onyx01` watchdog (cron, status JSON) + `kb-watch` poller on hermes01 (10-min end-to-end probe, Slack alert only on state transitions). Nightly MySQL dumps, 14-day rotation, on-box.
