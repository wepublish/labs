---
status: active
type: feat
created: 2026-06-11
origin: src/knowledge-engine/TODO.md (population checklist) + KNOWLEDGE_BASE_SPEC.md + repo research (wepublish/wepublish, wepublish/gitbook-wepublish-doc, docs.wepublish.ch, wepublish org)
target_repo: labs (src/knowledge-engine + src/hermes skills) — content lands on onyx01 RAGFlow
supersedes_partially: TODO.md "Next session: populate the KB" checklist (this plan replaces it)
---

# feat: Populate the We.Publish knowledge base

**Context:** Infrastructure is DONE and validated (engine, wire, skills, monitoring — see `../../kb-setup-log.json`). This plan fills the empty datasets so the KB carries a thorough understanding of the **wepublish monorepo, the CMS, and the documentation**, serving three consumers: (1) Hermes answering newsroom support questions, (2) Hermes drafting PRs and handling newsroom tickets (write guardrails already spec'd in `../../handover.html` — PAT scopes + branch protection; the KB's job is to make those drafts *correct*), and (3) developers needing context on newsrooms and their CMS implementations.

## Summary

Three content layers go in: the **public corpus** (GitBook docs ingested from their backing repo, llms.txt, marketing-site knowledge → `public`), the **repo/CMS knowledge layer** (monorepo docs, architecture, contribution conventions → `public`; generated API domain references → `internal`), and the **newsroom implementation layer** (generated per-newsroom profiles from the 18 in-monorepo apps → `internal`, tagged by slug). The third layer requires a small data-structure amendment: two new chunk `type` values and provenance tags, plus a clarified boundary — *raw source code is still never embedded; derived prose summaries of code are allowed when they carry source + commit + refresh discipline*.

---

## Load-bearing findings (verified 2026-06-11)

| # | Finding | Evidence | Impact |
|---|---|---|---|
| F1 | The real docs corpus is the **GitBook backing repo `wepublish/gitbook-wepublish-doc`** — 106 md files, ~645 KB (~95–100k words), actively updated. A site scrape adds ~500 words of GitBook nav chrome per page. | repo clone; firecrawl samples of docs.wepublish.ch | Ingest from the repo, not a scrape. The TODO's "doc-scrape" item is superseded. |
| F2 | Docs are **German throughout** (incl. developer docs); no French docs — FR exists only as a partial marketing-site mirror. | scraped samples; site map (103 pages) | bge-m3 is multilingual; eval must cover DE + EN + FR queries. FR gap is real and documented, not fixable by ingestion. |
| F3 | The CMS = 4 apps (`apps/api-example`, `apps/editor`, `apps/media`, `apps/website-example`) + ~55 domain libs. Agent-targeted docs exist in-repo: `.ai/{architecture,conventions,development,tech-stack}.md` (+ CLAUDE.md duplicates), `docs/*.md`, README, FAQ. | /tmp/wepublish-main clone | Repo knowledge layer is mostly *already written* — ingest, don't author. |
| F4 | **18 newsroom implementations live inside the monorepo** under `apps/<slug>/` (bajour, tsri, hauptstadt, reflekt, mannschaft, …). Per-newsroom knowledge exists only as code diffs vs `website-example` — no prose anywhere. | clone; org repo list (older standalone newsroom repos mostly archived) | "Developer context on newsrooms" must be **generated**, not scraped → implementation profiles (U6). |
| F5 | GraphQL: generated SDL `apps/api-example/schema-v2.graphql` (104.6 KB, 390 defs) + `libs/api/prisma/schema.prisma` (49 KB). Only prose API docs are GitBook `developers/api/`. | clone | Raw SDL embeds badly (no keyword search; vector-on-SDL is weak). Generate per-domain prose references instead (U5). |
| F6 | **llms.txt PR wepublish/wepublish#2802 is OPEN** — adds two index-style stubs (50/76 lines) under `apps/wepublish-site/public/`. Not a docs substitute. | `gh pr view 2802` | Ingest the two files from the PR branch now; verify live URLs post-deploy (existing TODO item stands). |
| F7 | Hermes PR-creation + ticket handling is **already designed**: fine-grained PAT (Issues/Contents/PRs), branch protection makes merge mechanically impossible, draft-in-Slack before filing. | HANDOVER.md:69-95; HERMES_SUPPORT_CHAT_SPEC.md | No KB-side conflict. The KB must carry contribution conventions, issue conventions, and architecture so drafts are right (U4, U7). |
| F8 | "Code is never embedded" appears in 5 specs; rationale: embeddings go stale, code-RAG is weak. Live code lookup = `wepublish-mcp` (deployed at mcp.wepublish.cloud). Live CMS state never indexed. | KNOWLEDGE_BASE_SPEC.md:22,27 et al. | Boundary stands for *raw code*. Derived prose with provenance + refresh is an extension of the existing "issues → reviewed summaries" pattern, not a violation (KTD2). |
| F9 | Marketing site carries unique knowledge absent from docs: `/de/develop` (integration matrix, "KI-Exoskelett" agents), `/de/netzwerk` (member directory: who runs We.Publish since when). | firecrawl scrapes | Small firecrawl ingest of ~6 evergreen pages (U3). |

---

## Key technical decisions

- **KTD1 — GitBook from repo, not scrape.** Clone `wepublish/gitbook-wepublish-doc`, ingest the 106 markdown files directly: clean content, no nav chrome, git-diffable refresh. Firecrawl is used only for the ~6 marketing pages that have no repo source. Canonical `source` URL per chunk = the docs.wepublish.ch page (derivable from the GitBook `SUMMARY.md` structure), falling back to the GitHub URL.
- **KTD2 — Boundary amendment (the "adjust data structure if necessary").** *Raw source code, SDL, and Prisma schema are never embedded* (unchanged, F8). **Derived prose about code MAY be embedded** when every chunk carries: `source` (GitHub URL), `commit` (short SHA it was derived from), `confidence: likely` (machine-generated; never `confirmed` without human review), and an entry in the refresh manifest. This extends the spec's own "issues → reviewed summaries" pattern and directly answers the staleness rationale: provenance makes staleness *detectable*, the manifest makes refresh *mechanical*.
- **KTD3 — Two new `type` values + provenance tags.** `type` enum gains `api_reference` (per-domain API prose, U5) and `implementation_profile` (per-newsroom, U6). New optional tags: `repo_path`, `commit`. Enforced in `kb-ingest` (`push_chunk.py`) and documented in `KNOWLEDGE_BASE_SPEC.md`.
- **KTD4 — Newsroom profiles live in `internal`, tagged `newsroom: <slug>`** — NOT 18 new datasets. Devs (internal tier) see all profiles, which is exactly requirement (3). When a newsroom's support channel goes live, its profile is *copied* into `newsroom:{slug}` so the newsroom can ask about its own setup. Avoids dataset sprawl for newsrooms that may never get a channel.
- **KTD5 — API knowledge = generated per-domain references, not raw schema.** ~20–25 domain docs (article, page, blocks, peering, member-plan/subscription/payment, comments, events, polls, navigation, user/permissions, mail/flows, paywall, …) each covering: purpose, key types + fields, key queries/mutations, gotchas, source pointers. Dataset `internal`, `type: api_reference`. Raw SDL stays live via `wepublish-mcp`.
- **KTD6 — Dataset placement.** Everything with a public source → `public` (GitBook both sections — the docs site is public — repo docs, llms.txt, marketing). Everything derived or operational → `internal` (API references, implementation profiles, support boundaries, ops knowledge). `newsroom:pilot` stays empty until the pilot newsroom is chosen (open question OQ1).
- **KTD7 — Official published docs ingest as `confidence: confirmed`, `reviewed_by: wepublish-docs`.** The `confirmed` gate exists to separate We.Publish-verified from newsroom-asserted knowledge; published official documentation IS We.Publish-verified. The "never auto-promote" rule keeps applying to everything else — generated content (U5, U6) is `likely`, newsroom content stays `unverified`.
- **KTD8 — Manifest-driven, idempotent bulk ingestion.** A checked-in manifest (file → dataset/type/source/owner/…) is the refresh contract: re-running the tool re-ingests only changed files (delete + reupload by document name). The recurring doc-scrape cron stays deferred (TODO "Smaller / later") — refresh is manual-but-mechanical until handover owners want automation.

---

## Scope boundaries

**In scope:** schema amendment, bulk-ingest tool, the three content layers, pilot-format review gate for generated profiles, retrieval-quality eval, bookkeeping.
**Out of scope (other TODO tracks, unchanged):** Slack manifest items, `RAGFLOW_CHANNEL_MAP` isolation work, CMS MCP #2801 validation, llms.txt live-URL verification post-#2802, off-box backups.

### Deferred to follow-up work
- Doc-scrape/refresh cron (IT-owned) — manifest makes it a cron one-liner later.
- GH-issue routing skill + PR-drafting skill for Hermes (HANDOVER.md:69-95 carries the design; KB content from U4/U7 is the prerequisite this plan delivers).
- Per-newsroom dataset copies (fires per newsroom at channel-launch, per KTD4).
- Issue/ticket summaries → `internal` (`issue_summary` type exists; needs the GH integration first).

---

## Implementation units

### U1. Data-structure amendment (spec + skills)
**Goal:** Make the schema carry derived-code knowledge safely (KTD2/KTD3).
**Files:** `src/knowledge-engine/specs/KNOWLEDGE_BASE_SPEC.md`, `src/hermes/skills/kb-ingest/SKILL.md`, `src/hermes/skills/kb-ingest/push_chunk.py`, `src/hermes/skills/kb-retrieve/SKILL.md`.
**Approach:** add `api_reference` + `implementation_profile` to the `type` enum; add optional `repo_path` + `commit` tags; spec gets a "derived code knowledge" subsection stating the amended boundary verbatim (raw code never; derived prose with provenance + refresh manifest yes). kb-retrieve SKILL.md gains one line: surface `commit` when answering from derived chunks. Redeploy kb-ingest to hermes01 (`/opt` skill dir, same path as the validated install).
**Test scenarios:** push_chunk accepts the two new types; rejects an unknown type (fail-closed unchanged); forced-tag env vars still override; a chunk with `commit` round-trips through retrieval with the tag visible.
**Verification:** canary ingest with `type: implementation_profile` retrievable on hermes01, then deleted.

### U2. Bulk-ingest tool (`kb-bulk`)
**Goal:** Manifest-driven batch ingestion so ~150 documents don't go in by hand (KTD8).
**Dependencies:** U1.
**Files:** `src/knowledge-engine/tools/kb-bulk`, `src/knowledge-engine/ingest/manifest.yaml` (new dir), `src/knowledge-engine/tools/README` note.
**Approach:** same transport pattern as `wp-kb` (API calls on-box over SSH). Manifest rows: local path or URL → dataset, type, source, owner, confidence, optional newsroom/repo_path/commit, title. Behaviors: `--dry-run` (print plan, no writes); idempotent re-run (document with same title: delete + reupload only if content hash changed); batch parse trigger ≤10 docs at a time (TEI/ES pressure — keep the box inside its reviewed memory envelope); summary report (ingested / skipped / failed).
**Test scenarios:** dry-run prints full plan with zero API writes; 2-doc live run lands both with correct tags; re-run with no changes skips both; re-run after editing one file replaces exactly that document; a manifest row with a disallowed dataset fails closed.
**Verification:** test docs visible via `wp-kb datasets` counts, then removed.

### U3. Public corpus → `public` (~115 docs)
**Goal:** The documentation layer — Hermes's primary support source.
**Dependencies:** U2.
**Files:** `src/knowledge-engine/ingest/manifest.yaml` (rows), clone of `wepublish/gitbook-wepublish-doc`.
**Approach:** (a) GitBook repo: all 106 files — `publisher-dokumentation/` (~55, German end-user docs), `developers/` (~45 incl. website-builder + api guides), get-started/troubleshooting; map each to its docs.wepublish.ch canonical URL via `SUMMARY.md`; `confidence: confirmed, reviewed_by: wepublish-docs` (KTD7). (b) llms.txt + llms-full.txt from the #2802 branch (`apps/wepublish-site/public/`). (c) ~6 marketing pages via firecrawl (`/de/develop`, `/de/netzwerk`, `/de/ueber-uns`, `/de/share`, `/de/start`, features overview), nav-stripped.
**Test scenarios:** German publisher query ("Wie richte ich eine Paywall ein?") retrieves the paywall doc top-3; developer query ("how does the block system work") retrieves block-system doc; llms.txt retrievable by "what is we.publish"; doc counts match manifest counts.
**Verification:** `wp-kb datasets` shows ~115 docs / parse complete in `public`; watchdog stays `ok` throughout.

### U4. Repo + CMS knowledge → `public`
**Goal:** Monorepo architecture, conventions, and dev workflow — what Hermes needs to draft correct PRs/tickets and devs need for orientation.
**Dependencies:** U2.
**Files:** manifest rows; clone of `wepublish/wepublish` (exists at /tmp/wepublish-main, re-clone pinned to HEAD at ingest time).
**Approach:** ingest once each: root `README.md`, `FAQ.md`, `.ai/{architecture,conventions,development,tech-stack}.md` (skip the CLAUDE.md/.cursorrules duplicates), `docs/{README,deployments,Releases,testing,commenting,CodeOrganization,emailtemplates,apps}.md`, `libs/website/src/lib/usage.mdx` + the handful of substantive lib `.mdx` files. `type: architecture` for .ai + CodeOrganization, `type: doc` otherwise; `repo_path` + `commit` tags on all. Skip: changelogs, boilerplate Nx lib READMEs.
**Test scenarios:** "what are the code conventions for contributing" retrieves `.ai/conventions.md`; "how is the monorepo organized" retrieves architecture/CodeOrganization; chunks carry commit tag.
**Verification:** ~20 docs in `public`, tagged with commit.

### U5. API domain references → `internal` (generated)
**Goal:** Prose API knowledge per domain so Hermes can answer "which mutation/fields" questions without raw-schema RAG (KTD5).
**Dependencies:** U1, U2.
**Files:** `src/knowledge-engine/ingest/api-reference/*.md` (~20–25 generated docs, checked in for review/diffing), manifest rows.
**Approach:** generate from `schema-v2.graphql` + `schema.prisma` + lib structure, one doc per domain. Fixed template: purpose · key types with important fields · key queries/mutations · permissions notes (`@Public()` vs gated) · gotchas · source pointers. `type: api_reference`, `confidence: likely`, `commit` tag. Checked into the repo so refresh = regenerate + diff.
**Test scenarios:** "what fields does MemberPlan have" retrieves the member-plan reference; "how does peering work at the API level" retrieves the peering reference; every doc names its source files.
**Verification:** spot-check 3 generated docs against the SDL for factual accuracy before ingest; all docs in `internal`.

### U6. Newsroom implementation profiles → `internal` (generated, gated rollout)
**Goal:** Requirement (3) — developer context on how each newsroom implements the CMS.
**Dependencies:** U1, U2.
**Files:** `src/knowledge-engine/ingest/newsroom-profiles/*.md` (18, checked in), manifest rows.
**Approach:** per `apps/<slug>/`, generate a profile from code inspection diffed against `apps/website-example`: stack + structure, theming, custom blocks / block styles used, integrations (payment, mail, analytics), membership/paywall configuration shape, peering participation, notable custom routes/features. `type: implementation_profile`, `newsroom: <slug>`, `source: <github tree URL>`, `commit`, `confidence: likely`. **Gated rollout:** generate bajour, tsri, hauptstadt first → Tom reviews format/accuracy → batch the remaining 15.
**Execution note:** profiles describe implementation shape, never operational/tenant data (subscriber counts, revenue, credentials) — that boundary is unchanged (F8).
**Test scenarios:** "how does bajour implement its paywall" retrieves the bajour profile; "which newsrooms use crowdfunding blocks" retrieves the right profiles; no chunk contains secrets/tenant data (grep the generated files for env-var patterns before ingest).
**Verification:** 3-profile pilot reviewed; then 18 docs in `internal` tagged by slug.

### U7. Internal operational seed → `internal`
**Goal:** What Hermes must know about its own operating rules and We.Publish support practice.
**Dependencies:** U1, U2.
**Files:** `src/knowledge-engine/ingest/internal-ops/*.md` (~4–6 distilled docs, checked in), manifest rows.
**Approach:** distill from the existing specs (not raw-dump them): support boundaries doc (refusals: credentials/payment/member data → CMS), ticket + PR conventions doc (issue fields, draft-before-filing, no-merge rule — from HERMES_SUPPORT_CHAT_SPEC + HANDOVER), newsroom onboarding checklist (from MCP_DELIVERY_SPEC onboarding flow), AI-stack overview (KB access paths, what lives where). `type: decision`/`doc`, `source:` the labs spec path, `confidence: confirmed, reviewed_by: tom` after Tom reads them. Chat-driven kb-ingest remains the ongoing path for tacit ops knowledge — this unit seeds, it doesn't exhaust.
**Test scenarios:** "can you share a newsroom's Stripe key" retrieval surfaces the boundaries doc; "what goes in a support ticket" retrieves conventions doc.
**Verification:** docs retrievable; Tom has reviewed before `confirmed` is applied (else they go in as `likely`).

### U8. Retrieval-quality eval (DE / EN / FR)
**Goal:** The spec's pilot acceptance evidence (≥90% of answerable public questions return citations).
**Dependencies:** U3–U7.
**Files:** `src/knowledge-engine/ingest/eval-questions.md` (question set + results table, checked in).
**Approach:** ~30 questions: 10 German publisher (editor, abos, peering), 10 English developer (architecture, API, website-builder), 5 internal (newsroom profiles, conventions), 5 French support-style (tests bge-m3 cross-lingual DE-docs-from-FR-queries — expected weaker; measure, don't assume). Run via `wp-kb query` + kb-retrieve on hermes01; record top-5 hit + similarity. Failures → chunking/manifest fixes, re-run.
**Test scenarios:** the question set itself is the test. Pass bar: ≥90% public-answerable hit top-5; internal questions hit the right doc; FR results documented whatever they are.
**Verification:** results table committed; misses triaged or documented as known gaps.

### U9. Bookkeeping
**Goal:** Keep the handover artifacts true.
**Dependencies:** U3–U8.
**Files:** `src/knowledge-engine/TODO.md`, `src/knowledge-engine/kb-setup-log.json`, `src/knowledge-engine/README.md`.
**Approach:** TODO population section → done/pointer to this plan; setup-log gains population entries (counts per dataset, commit SHAs of sources); README gains "What's in the KB" + refresh procedure (re-clone sources → re-run kb-bulk → eval spot-check).
**Test expectation: none** — documentation unit.
**Verification:** `wp-kb datasets` counts match the README's stated contents.

---

## Risks & open questions

| # | Risk / question | Treatment |
|---|---|---|
| R1 | Bulk parse pressure on onyx01 (TEI/ES reviewed envelope: 7.3/15.6 GiB steady) | U2 batches ≤10 docs/parse; watchdog already alerts on transitions; total corpus ~0.9 MB markdown ≈ low thousands of chunks vs ~200K capacity — low risk, monitored anyway |
| R2 | Generated content (U5/U6) wrong or stale | `likely` confidence + commit provenance + checked-in sources (diffable) + 3-profile review gate; monthly refresh listed in spec maintenance cadence |
| R3 | German-only docs vs French-speaking newsrooms | Not fixable by ingestion; U8 measures cross-lingual retrieval; result feeds the docs-strategy conversation with We.Publish |
| R4 | `confirmed` semantics widened by KTD7 | Bounded: only *published official docs* with explicit `reviewed_by: wepublish-docs`; everything generated stays `likely` |
| OQ1 | Which newsroom is the pilot for `newsroom:pilot`? | **RESOLVED 2026-06-11: bajour** (Tom). The `newsroom:pilot` dataset is renamed `newsroom:bajour` (rename only — the dataset ID stays, so allowlists on hermes01 are untouched). U6 pilots with bajour first; its profile is copied into `newsroom:bajour` once reviewed. |
| OQ2 | Should `developers/` GitBook docs also mirror into `internal`? | No — `public` is readable by every tier; duplication adds retrieval noise. Revisit only if newsroom-facing retrieval surfaces dev docs unhelpfully. |
