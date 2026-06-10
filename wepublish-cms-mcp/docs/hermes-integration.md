# Hermes integration

The CMS MCP runs co-located with Hermes on `hermes01` and is reached over **stdio**
(phase 1). Hermes is the only client; it scopes every call to one tenant and never
exposes the tool surface to newsrooms directly.

## Launch

Hermes spawns the server as a stdio MCP subprocess:

```jsonc
{
  "command": "node",
  "args": ["/opt/wepublish-cms-mcp/dist/index.js"],
  "env": {
    "WEPUBLISH_API_URL": "https://api.<tenant>.ch/graphql",
    "WEPUBLISH_API_TOKEN": "<scoped admin token>",
    "WEPUBLISH_ENV": "production",
    "WEPUBLISH_PRINCIPAL": "hermes"
  }
}
```

For multi-tenant use, either (a) run one instance per tenant with a tenant-scoped
token + `WEPUBLISH_TENANT`, or (b) pass `tenant` on each tool call once the
single-endpoint, multi-tenant scoping mechanism is confirmed on a live server
(see `TENANT_HEADER` in `src/client.ts`).

## Decision order (per MCP_DELIVERY_SPEC)

1. Hermes searches RAGFlow first.
2. **If live CMS state matters → call a CMS MCP read tool here.**
3. Draft the answer with the tool's `findings` + `nextChecks` + provenance.
4. Tracked work → Linear; external replies/writes → human approval.

## Output contract

Each tool returns the uniform envelope (see README). Hermes should surface
`status`, `findings`, and `nextChecks`, and may paste `cms_generate_onboarding_report`'s
`findings.report` markdown straight into a Linear issue or ingest it as a reviewed
summary. Treat `status: error` as "could not determine" — never as "all good".

## Not here

- **Writes** (CMS mutations) — separate gated phase (dry-run + approval + audit).
- **Generation/LLM** — Hermes owns that (OpenRouter); this server only retrieves CMS state.
- **Transport other than stdio** — streamable-HTTP + remote auth is deferred.
