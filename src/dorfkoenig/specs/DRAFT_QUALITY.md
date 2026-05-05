# Dorfkönig Draft Quality — System Spec

> **Status:** draft (2026-04-22, optimized after Big Tony + code-reviewer pass, scoped to capture-only feedback) · **Owner:** Tom · **Scope:** automated village newsletter drafting (`bajour-auto-draft`) for 20 villages.
>
> Source of truth for the quality overhaul. Every PR that touches the drafting pipeline, extraction prompts, or the `bajour_drafts` schema links here. When behaviour changes, this file changes first.

## Table of contents

1. [Goals & principles](#1-goals--principles)
2. [Target behaviour](#2-target-behaviour)
3. [Architecture changes](#3-architecture-changes)
   - 3.1 [Bullet-only schema + `kind` caps](#31-bullet-only-schema--kind-caps)
   - 3.2 [Compound date filter + quality score at ingest](#32-compound-date-filter--quality-score-at-ingest)
   - 3.3 [Extraction enrichments](#33-extraction-enrichments)
   - 3.4 [Compose prompt hardening](#34-compose-prompt-hardening)
   - 3.5 [Deterministic post-validation](#35-deterministic-post-validation)
   - 3.6 [Prompt versioning hygiene](#36-prompt-versioning-hygiene)
   - 3.7 [Feedback capture (capture-only)](#37-feedback-capture-capture-only)
4. [Benchmark system](#4-benchmark-system)
5. [Production metrics capture](#5-production-metrics-capture)
6. [Rollout](#6-rollout)
7. [Rollback](#7-rollback)
8. [Deferred / out of scope](#8-deferred--out-of-scope)
9. [Success metrics](#9-success-metrics)

---

## 1. Goals & principles

**Goal.** At 20 villages × ~365 editions/year ≈ 7,300 drafts/year: editor rejection rate < 20% per village per week, URL-citation validity = 100%, zero forbidden phrases.

**Principles.** Every design decision in §3 derives from one of these:

| # | Principle | Consequence |
|---|---|---|
| P1 | **Under-produce > hallucinate** | Empty bullet lists are valid. Thin-material days produce no draft and notify admins. Never filler. |
| P2 | **Deterministic > clever** | Structural decisions (skeleton, dates, citations, kind caps) are code. Only prose-slot filling is LLM. Every LLM decision is a surface for regression at scale. |
| P3 | **Feedback compounds in the background** | Rejected bullets are captured and sanitised but not yet used. Retrieval + self-learning is a separate future scope (§8). Meanwhile Tom feeds markdown-file feedback into prompt updates manually. |
| P4 | **Quality is measured before it ships** | Benchmarks gate prompt/model changes. Weekly metric review catches production drift. No "it felt better" changes. |

**Non-goals.**

- Not changing the scout-extraction pipeline end-to-end — only adding fields (§3.3).
- Not redesigning WhatsApp verification — only adding a capture hook (§3.7).
- Not building an editor-for-manual-edits UI (deferred, §8).
- Not building a UI for prompt editing (deferred, §8) — versioning hygiene (§3.6) is code + PR discipline + one SQL check.
- Not activating feedback-driven retrieval / evals / self-learning (deferred, §8). Captured data sits dormant.

---

## 2. Target behaviour

### 2.1 Anatomy of a good edition

Sources: `/Users/tomvaillant/buried_signals/wepublish/Feedback Dorfkönig.md` rows 1–3 + `image.png`.

- **2–4 bullets**, each opens with a topical emoji from a closed palette.
- **One self-contained sentence or two short sentences per bullet.** First clause = the news, second = context or "mehr dazu" link.
- **Inline natural-language citation with exactly one Markdown link to the specific article URL**: `wie die [bz Basel](https://www.bzbasel.ch/.../ld.4152854) berichtet`, `meldet die [Gemeinde](https://www.arlesheim.ch/.../Bauinfo...pdf)`. No `[domain](homepage)(real-url)` double links.
- **No greeting, Ausblick, sign-off.** The edition is a digest, not a letter.
- **No cross-village standalones.** Regional context only when it directly affects the target Gemeinde.

### 2.2 Observed failure modes (editor feedback)

- Stale events as news (12. März item shipped on 20. April).
- Deceased-person announcements with no handling care from old sources.
- Filler: `"Bis zur nächsten Ausgabe — Ihre Redaktion"`, `"Vielen Dank für Ihr Interesse"`.
- Forced duplication: same item in body AND Ausblick.
- Future events clustered at the expense of news (Juni–August-events shipped in April).
- Cross-village items as target-village news (Münchenstein Spitex standalone in Arlesheim).
- Link decay: `[arlesheim.ch](https://arlesheim.ch/)(https://www.arlesheim.ch/de/veranstaltungen/)`.

### 2.3 Forbidden phrases (deterministic banlist)

Lives in `_shared/draft-quality.ts` as exported regex array. Post-validation (§3.5) strips hits and appends to `notes_for_editor`; does not fail the draft.

```
/Bis zur nächsten Ausgabe/i
/Ihre Redaktion/i
/Vielen Dank für Ihr Interesse/i
/Wochenüberblick/i
/^#+\s*Ausblick\b/im
/^Ausblick$/im
/weiter[en]* spannende(n)? Veranstaltungen/i
/Liebe Leserinnen und Leser/i
```

### 2.4 Anti-pattern table (inlined in compose prompt)

| Anti-pattern | Editor's reason | Rule |
|---|---|---|
| Past event as news | "6 Wochen alt" | §3.2 compound filter + prompt rule "keine Meldung mit `event_date` > 3 Tage in der Vergangenheit ausser als Korrektur/Follow-up" |
| Homepage-only link | "Link führt nur auf Hauptseite" | §3.4.3 listing-page guard — `article_url = null` → no link |
| Forced outlook/sign-off | "unnötige Dopplung" | §3.1 schema has no outlook/sign_off fields |
| Cross-village standalone | "nicht vorgesehen" | §3.4.5 code-side filter pre-prompt |
| Far-future event | "sehr weit in der Zukunft" | §3.2 `event_date` within [today-1d, today+14d] |
| Death without care | "besondere Sorgfalt" | §3.3 `sensitivity ≠ none` → `review_required`, no emoji lead, tighter age gate |

---

## 3. Architecture changes

Seven subsections. Each has **what**, **why**, **files**, **rollback**.

### 3.1 Bullet-only schema + `kind` caps

**What.** Replace freeform schema in `bajour-auto-draft/index.ts:196-208` with:

```ts
type Draft = {
  title: string;                      // "Arlesheim — Dienstag, 22. April 2026"
  bullets: Bullet[];                   // 0–4 items; 0 is valid, see §3.1.1
  notes_for_editor: string[];          // what was dropped + why; may be empty
};

type Bullet = {
  emoji: string;                       // from closed palette in §3.1.2
  kind: 'lead' | 'secondary' | 'event' | 'good_news';
  text: string;                        // 1–2 sentences, no leading emoji (renderer adds it)
  article_url: string | null;          // from input unit set, or null
  source_domain: string | null;        // display text for citation, "bz Basel" / "Gemeinde Arlesheim"
  source_unit_ids: string[];           // provenance
};
```

**`kind` caps** (enforced by `validateKindCounts` in §3.5, not by the LLM):
- `lead` — 0 or 1
- `secondary` — 0–2
- `event` — 0–1 (max one event bullet per edition)
- `good_news` — 0 or 1

Extras are demoted (e.g. second `lead` → `secondary`) or dropped with a warning.

**§3.1.1 Empty/withheld draft is valid.** When the LLM returns `bullets: []`, the run exits through the empty-path email flow. When a draft has bullets but fails post-compose quality gates, save the draft with `verification_status='withheld'`, persist `quality_warnings`, do not mark selected units as used, and do not send WhatsApp verification. Admin notification path is §3.1.4.

**§3.1.2 Emoji palette (closed list, approved 2026-04-22).**

```
🏠 🏗️ 🗳️ 🚗 🚧 📚 🎶 🌿 ⚖️ 🏢 👤 📍 📅 🐈 ⚠️ ✅
```

Lives in `_shared/draft-quality.ts`. `validateEmojiPalette` (§3.5) strips anything else.

**§3.1.3 One compose call (not parallel).** At 20 villages × 4 slot calls = 80 concurrent OpenRouter requests at 18:00 — rate-limit risk outweighs marginal quality gain. One call receives all units + the anti-pattern table and returns a full `Draft`. `kind` caps are enforced post-generation in TS.

**§3.1.4 Empty-path and withheld admin notifications.** Four paths can end with no WhatsApp verification being sent:

| Case | Where | Trigger |
|---|---|---|
| (a) Zero units after filtering | early return in `bajour-auto-draft/index.ts:122-130` | units query returns empty (§3.2 filter matched nothing) |
| (b) Units exist but all below `quality_score < 40` | same early return | `quality_score >= 40` clause excludes every row |
| (c) LLM returns `bullets: []` | post-validator in §3.5 | compose completed but `notes_for_editor` non-empty, `bullets` empty |
| (d) Draft generated but quality gate blocks send | `_shared/auto-draft-quality.ts` after compose validators | title/body mismatch, severe editor notes, weak sources, omitted high-ranked selected unit, or event bullet lacks enough context |

On empty paths (a-c), send one email to `ADMIN_EMAILS` via `buildDraftFailureEmail()`:

- Subject: `[Dorfkönig] Kein Entwurf für {village_name} am {date} — {case_label}`
- Body includes: village, date, case label, reasons:
  - Case (a): "Keine Einheiten im Zeitfenster. Prüfe Scout-Status + Kriterien."
  - Case (b): count of units filtered + top 3 reasons from `explainQualityScore(unit)` (deterministic, re-computed on demand from raw fields)
  - Case (c): full `notes_for_editor` array verbatim
- Deep-link to `#/feed?village={village_id}` for the editor to investigate

On withheld drafts (d), save the draft row, set `verification_status='withheld'`, write `quality_warnings`, and email `ADMIN_EMAILS` via `buildDraftWithheldEmail()` with a signed admin deep-link. `bajour-send-verification` rejects withheld drafts.

**No WhatsApp message to correspondents on any of these paths.** Admins are the sole notification target for empty-day / withheld conditions.

**Rate-limit.** Bounded — worst case 20 emails/day (one per village). Fine. If volume becomes annoying, add a daily digest option later.

**Schema version.** `bajour_drafts` gets `schema_version INT NOT NULL DEFAULT 1` + `bullets_json JSONB` (nullable until Phase 1 ships, then required for `schema_version=2`). Renderer branches on version.

**Files.** `bajour-auto-draft/index.ts`, `compose/index.ts`, `_shared/prompts.ts`, `_shared/draft-quality.ts`, `_shared/auto-draft-quality.ts`, `_shared/resend.ts`, `bajour/types.ts`, `components/compose/DraftContent.svelte`, `components/compose/DraftList.svelte`, `components/compose/VerificationBadge.svelte`.

**Rollback.** `VITE_FEATURE_BULLET_SCHEMA=false` → new drafts write v1 markdown; existing v2 drafts render via the new renderer (which handles both shapes). Empty-path emails gated by `feature_empty_path_email` flag in `user_settings`.

---

### 3.2 Compound date filter + quality score at ingest

**What.** Two changes. Get clean input to the selector.

**§3.2.1 Compound date filter.** Replace single `created_at >= cutoff` at `bajour-auto-draft/index.ts:96-105` with:

```sql
WHERE user_id = $user
  AND location->>'city' = $village
  AND used_in_article = false
  AND (
    (event_date IS NULL AND created_at >= NOW() - INTERVAL '7 days')
    OR event_date BETWEEN CURRENT_DATE - INTERVAL '1 day'
                      AND CURRENT_DATE + INTERVAL '14 days'
  )
  AND created_at >= NOW() - INTERVAL '30 days'  -- hard backstop
  AND quality_score >= 40
```

News units (no `event_date`) are fresh if ingested ≤ 7d. Event units are relevant if the event is near-term (−1d to +14d). 30d backstop prevents zombie units.

**§3.2.2 Unit quality score.** Deterministic 0–100, computed at ingest, stored as `information_units.quality_score INT`. Weights in `_shared/quality-scoring.ts`:

| Signal | Weight |
|---|---|
| `source_url` is article-level (path depth ≥ 3, not listing root) | +25 |
| Has precise `event_date` (`DateConfidence = 'exact'`) | +15 |
| `publication_date >= today - 3d` | +20 |
| `village_confidence = 'high'` *(field already emitted by current extractors)* | +15 |
| `sensitivity = 'none'` | +10 |
| Not a social-media domain | +10 |
| Statement ≥ 40 chars | +5 |

Units with `quality_score < 40` are filtered out by §3.2.1. Reasons are **not** stored; they're re-computed on demand from the raw fields via `explainQualityScore(unit)` — used in §3.1.4 failure emails.

**Files.** New migration (additive columns; columns in §3.3 land in the same migration). `_shared/quality-scoring.ts` (new). Call sites: `execute-scout/index.ts`, `manual-upload/index.ts`, `process-newspaper/index.ts`. `bajour-auto-draft/index.ts` filter.

**Rollback.** Feature flag `use_quality_gating` in `user_settings`. Off → omit `quality_score >= 40` from the WHERE. Columns additive.

---

### 3.3 Extraction enrichments

**What.** Four fields added to extraction output schema in `web-extraction-prompt.ts` and `zeitung-extraction-prompt.ts`:

- `publication_date` — date the *article* was published (distinct from scrape/ingest time). Required for recency scoring.
- `sensitivity` ∈ `{none, death, accident, crime, minor_safety}`. Drives handling rules.
- `is_listing_page` (bool). True when input is an index/listing page, not an article body.
- `article_url` — URL of the specific article (may differ from `source_url` when scraping listing pages).

**§3.3.1 Listing-page refusal.** Extraction prompts get:

> "Wenn die Eingabe eine Übersichts- oder Listenseite ist (mehrere unzusammenhängende Meldungen ohne Artikelkörper), gib `units: []` zurück und liste `['listing_page']` in `skipped`. NICHT aus der Übersicht extrahieren."

Eliminates the upstream source of the homepage-link defect — no units, no citation problem.

**§3.3.2 Sensitivity handling.** Extraction prompt: sensitive items get `review_required = true` (already-existing column) and neutral statement phrasing. Selection prompt: sensitive items only admitted when `publication_date ≥ today - 3d`. Compose prompt: sensitive items get no emoji lead and full source in prose.

**Prompt version bumps.** `WEB_EXTRACTION_PROMPT_VERSION` and `NEWSPAPER_EXTRACTION_PROMPT_VERSION` both bump. Content-hash cache invalidates → one-time re-extraction of all active units on first post-deploy scrape. Quantify and document cost in the migration PR.

**Files.** `_shared/web-extraction-prompt.ts`, `_shared/zeitung-extraction-prompt.ts`, `_shared/unit-extraction.ts`, migration (shared with §3.2).

**Rollback.** New fields nullable, zero-weight in §3.2.2 when NULL. Revert prompt-version constants → content-hash cache re-invalidates, next runs use previous prompts.

---

### 3.4 Compose prompt hardening

**What.** Rewrite `DRAFT_COMPOSE_PROMPT` and the caller-side assembly in `bajour-auto-draft/index.ts:189-210`.

**§3.4.1 Under-produce clause.** At top AND bottom of the prompt (repetition intentional — negative instructions stick better when stated twice):

```
QUALITÄTSSCHWELLE:
Wenn du weniger als 2 Meldungen findest, die den Regeln entsprechen, gib
"bullets": [] zurück und erkläre in "notes_for_editor" warum. Ein leerer
Entwurf ist besser als erfundener Inhalt. NIEMALS Füllsätze, NIEMALS eine
Begrüssung oder einen Ausblick, NIEMALS eine Grussformel.
```

**§3.4.2 Single canonical citation.** `formatUnitsByType` in `_shared/prompts.ts` stops pre-formatting units as `[domain](url)` Markdown — this is the source of the double-link bug (LLM treats formatted input as data and re-formats). New format, plain-data:

```
EREIGNIS | 2026-04-22 | Musikschule Reinach veranstaltet Tag der offenen Tür | URL: https://... | DOMAIN: bz Basel | QUALITY: 85
```

Compose prompt citation rule:

```
ZITATION:
- Jedes Bullet enthält genau einen Markdown-Link: [DOMAIN](URL).
- Muster: "... wie die [DOMAIN](URL) berichtet", "meldet die [DOMAIN](URL)",
  "laut [DOMAIN](URL)".
- Wenn article_url leer ist: KEIN Link; stattdessen "laut Gemeindemitteilung",
  "aus der Facebook-Gruppe XY" (ohne Link).
- NIEMALS zwei Links hintereinander. NIEMALS eine URL in runden Klammern
  nach einem Markdown-Link.
```

**§3.4.3 Listing-page guard (deterministic, pre-prompt).** Before composing, code checks each unit: if `is_listing_page = true` OR `article_url IS NULL` OR URL matches the scout's base URL → the unit's `article_url` is set to `null` in the prompt payload and tagged `NO_LINK`.

**§3.4.4 Prompt negatives (static).** The §2.4 anti-pattern table is inlined in the compose prompt as a labelled negative-example block. Additions to the table over time land via prompt-text PRs (with `DEFAULT_PROMPT_VERSIONS.draft_compose` bump per §3.6). Tom's markdown-file feedback gets folded into this table manually.

> Dynamic per-village retrieval from `bajour_feedback_examples` is **not** in scope for this spec. See §8 + `specs/followups/self-learning-system.md`.

**§3.4.5 Cross-village exclusivity.** Code-side pre-filter (tighten the existing check at `bajour-auto-draft/index.ts:178`): drop when `location.city != village_id` OR `village_confidence = 'low'`.

**Files.** `_shared/prompts.ts`, `bajour-auto-draft/index.ts`, `compose/index.ts` (atomic — both call sites ship in the same PR or manual compose regresses).

**Rollback.** Prompt text is versioned (§3.6). Revert = bump `DEFAULT_PROMPT_VERSIONS.draft_compose` back.

---

### 3.5 Deterministic post-validation

**Principle.** LLM output is repaired deterministically, never regenerated. Regeneration drifts; repair is predictable.

All validators in `_shared/draft-quality.ts`:

```ts
validateUrlWhitelist(draft, inputUnits): { draft, warnings[] }
  // Strip any link whose URL isn't in inputUnits' source_url / article_url sets.
  // Warning: "Link in Bullet N entfernt — nicht in Quellen (was: https://...)"
  // After strip: if bullet text is empty, drop the bullet.

validateForbiddenPhrases(draft): { draft, warnings[] }
  // Regex banlist (§2.3). Replace hit with "[ENTFERNT: Füllsatz]".
  // If replacement leaves bullet empty, drop the bullet.

validateEmojiPalette(draft): { draft, warnings[] }
  // Strip any emoji not in §3.1.2 palette. Bullet keeps text.

validateKindCounts(draft): { draft, warnings[] }
  // Enforce caps from §3.1. Extras beyond caps:
  //   extra 'lead'      → demote to 'secondary' (or drop if secondary full)
  //   extra 'event'     → demote to 'secondary' if event-content suits it, else drop
  //   extra 'good_news' → drop
  // Warning per demotion/drop.
```

**Warning sink.** Validator warnings append to `notes_for_editor`. Post-compose quality gate warnings also persist as `bajour_drafts.quality_warnings` and render prominently in the draft UI.

**Fail-closed triggers.** If after all validators `bullets.length === 0`, the empty-path admin email (§3.1.4 case c) fires. If bullets remain but the quality gate finds blockers, the draft is saved as `withheld`, selected units are not marked `used_in_article`, and the withheld admin email fires.

**Files.** `_shared/draft-quality.ts` (emoji palette, banlist, validators), `_shared/auto-draft-quality.ts` (date context, fallback selection, gate policy), `bajour-auto-draft/index.ts`, `compose/index.ts`.

**Rollback.** Wrap validator chain in `if (featureFlag('draft_validation'))`. Off = pre-change behaviour.

---

### 3.6 Prompt versioning hygiene

**What.** Minimum viable versioning — code-side constant + PR discipline + one SQL check for stale overrides. The editor UI is explicitly deferred (§8).

**Code.**

```ts
// _shared/prompts.ts
export const DEFAULT_PROMPT_VERSIONS = {
  information_select: 3,
  draft_compose: 5,
  web_extraction: 3,        // aliased from WEB_EXTRACTION_PROMPT_VERSION
  zeitung_extraction: 2,    // aliased from NEWSPAPER_EXTRACTION_PROMPT_VERSION
} as const;
```

Bumping is a PR discipline: any edit to prompt text requires a version bump in the same PR. Benchmarks (§4) gate the PR.

**PR template addition** (`.github/pull_request_template.md`): checkbox *"If this PR edits prompt text, I bumped the matching `DEFAULT_PROMPT_VERSIONS` key."*

**Admin check** (add to `specs/DATABASE.md`):

```sql
-- Stale overrides: user_prompts whose base version is behind current defaults
SELECT up.user_id, up.prompt_key, up.based_on_version, up.updated_at
FROM user_prompts up
WHERE NOT EXISTS (
  SELECT 1 FROM user_prompts up2
  WHERE up2.user_id = up.user_id AND up2.prompt_key = up.prompt_key
    AND up2.updated_at > up.updated_at
)
ORDER BY up.updated_at;
```

**Schema change.** `user_prompts.based_on_version INT NOT NULL DEFAULT 1`. One column, no UI, no delta logic. Tom runs the SQL monthly.

**Files.** `_shared/prompts.ts`, migration, PR template, `specs/DATABASE.md`.

**Rollback.** Column is additive with default. No runtime behaviour depends on it until the follow-up spec picks up delta-application.

---

### 3.7 Feedback capture (capture-only)

**What.** Sanitise rejected bullets and store them for future use. **No retrieval, no reading, no prompt use in this scope.** Data sits dormant; activation (retrieval + evals + self-learning) belongs to a separate future spec tracked in `specs/followups/self-learning-system.md`.

The rationale for capturing now even without use: once the self-learning system is built, the dataset is already clean and accumulated — no cold-start problem, no retroactive sanitisation.

**§3.7.1 Capture path.** In `bajour-whatsapp-webhook` (edge function, TS — not a PG trigger, Big Tony C2), on every `abgelehnt` transition of a draft:

1. Read `bajour_drafts.bullets_json` only (skip if `schema_version = 1` and log a `capture_skipped_legacy_schema` counter).
2. For each bullet, run `sanitiseBulletForFeedback(bullet)` (§3.7.2). Reject any that fails.
3. Idempotency check: `SELECT 1 FROM bajour_feedback_examples WHERE draft_id = $draftId LIMIT 1`. Skip if already captured.
4. Insert surviving bullets as `kind='negative'`. The aggregated editor reason from `verification_responses` is stored as `editor_reason`.

**§3.7.2 Sanitisation (load-bearing security control — Big Tony C1).** In `_shared/feedback-sanitise.ts`:

```ts
function sanitiseBulletForFeedback(bullet: Bullet):
  | { ok: true; text: string; editor_reason: string | null; article_url: string | null }
  | { ok: false; reason: string }
```

Rules (fail → reject; transform → accept):

- Length: 20–400 chars after strip (reject outside).
- Strip: code fences (```), triple-backtick variants, XML/HTML-ish tags (`<[^>]+>`).
- Strip Markdown link targets EXCEPT those whose URL is in the draft's `source_unit_ids[*].source_url` / `.article_url`.
- Reject on instruction-shaped text: case-insensitive match against a maintained list — `ignoriere`, `ignore previous`, `system:`, `you are`, `du bist`, `<|`, `|>`, `[INST]`, `<<SYS>>`.
- Reject if non-Latin-script run ≥ 8 chars (German allow-list: Latin + common Swiss-German diacritics).
- Cap to 400 chars after all transforms.

Sanitisation is mandatory at capture even though data is unused today — a dirty backlog at activation time would force a retroactive sweep. Cleaner to sanitise on write.

**§3.7.3 Schema.**

```sql
CREATE TABLE bajour_feedback_examples (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id        UUID REFERENCES bajour_drafts(id) ON DELETE SET NULL,
  village_id      TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('positive','negative')),
  bullet_text     TEXT NOT NULL,
  editor_reason   TEXT,
  source_unit_ids UUID[] DEFAULT '{}',
  edition_date    DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_feedback_village_kind ON bajour_feedback_examples (village_id, kind, created_at DESC);
```

RLS: service_role ALL, authenticated users SELECT own-village rows (pilot-list scoped).

**§3.7.4 Positive seed backfill.** Migration inserts ~15 positive examples per pilot village from `/Users/tomvaillant/buried_signals/wepublish/Feedback Dorfkönig.md` (for Arlesheim; other pilot villages get a handful as Tom curates them). Stored as `kind='positive'`.

**§3.7.5 Markdown feedback intake.** Tom provides ongoing feedback via markdown files in `src/dorfkoenig/docs/feedback/{village}/{YYYY-MM-DD}.md`. Simple format — one bullet per line with `+` or `-` prefix and optional reason:

```markdown
# Arlesheim — 2026-04-22 — Editor review

+ 🏠 Die Villa Kaelin, erbaut 1930 ..., darf abgerissen werden ...
+ 🏗️ Die Bauarbeiten am Kindergarten «Im Lee» ...
- "Aus dem Gemeinderat: Der Gemeinderat ist wieder komplett ..." → 6 Wochen alt
- "Bis zur nächsten Ausgabe — Ihre Redaktion" → verbotene Grussformel
```

`scripts/ingest-feedback.ts` (new) parses files and inserts as `positive`/`negative` rows. Run manually by Tom when he drops new files. Same sanitisation applies.

**§3.7.6 What captured data is used for today: nothing.** No retrieval call in compose. No scheduled job reads the table. Data accumulates for the follow-up spec.

**Files.** `bajour-whatsapp-webhook/index.ts`, `_shared/feedback-sanitise.ts` (new), `scripts/ingest-feedback.ts` (new), `src/dorfkoenig/docs/feedback/` directory scaffold, migration.

**Rollback.** Drop capture call in webhook (1 line). Table remains harmless, can be dropped if needed (`DROP TABLE bajour_feedback_examples CASCADE`).

---

## 4. Benchmark system

One-shot evaluator for testing prompt/model/config changes against frozen fixtures.

### 4.1 Fixtures

**Location.** `src/dorfkoenig/supabase/functions/_tests/fixtures/drafts/{village}-{YYYY-MM-DD}.json`.

**Format.**

```json
{
  "fixture_id": "arlesheim-2026-04-20",
  "village_id": "arlesheim",
  "village_name": "Arlesheim",
  "edition_date": "2026-04-20",
  "units": [
    {
      "id": "uuid",
      "statement": "...",
      "unit_type": "event",
      "event_date": "2026-04-22",
      "publication_date": "2026-04-18",
      "created_at": "2026-04-18T14:22:00Z",
      "location": { "city": "arlesheim", "country": "CH" },
      "source_url": "https://...",
      "source_domain": "bz Basel",
      "article_url": "https://...",
      "is_listing_page": false,
      "sensitivity": "none",
      "village_confidence": "high",
      "quality_score": 85
    }
  ],
  "gold": {
    "bullets": [
      {
        "emoji": "🏠",
        "kind": "lead",
        "text": "Die Villa Kaelin ...",
        "article_url": "https://www.bzbasel.ch/...",
        "source_domain": "bz Basel",
        "source_unit_ids": ["uuid1"]
      }
    ],
    "rejected_units": [{ "unit_id": "uuid9", "reason": "6 Wochen alt" }]
  }
}
```

**Initial set: 5 fixtures.**
- `arlesheim-2026-04-20` — row 1 (stale news + cross-village leaks)
- `arlesheim-2026-04-XX-events` — row 2 (events-only draft)
- `arlesheim-2026-04-XX-death` — row 3 (sensitive content)
- `synthetic-empty-day` — 0 units → expect empty draft
- `synthetic-thin-listing` — 1 listing-page unit → expect empty draft with note

**Pilot coverage rule.** Every village in `bajour_pilot_villages_list` must have ≥ 1 fixture within 7 days of joining the pilot. Manual check until Phase 2 adds automation.

### 4.2 Metrics

Pure-TS, in `_tests/bench/metrics.ts`. Each returns `{ pass, score, detail }`.

| Metric | Pass condition | Weight |
|---|---|---|
| `bullet_count` | `bullets.length in [0, 4]`; 0 allowed only if `notes_for_editor` non-empty | 15 |
| `no_filler` | Zero hits on §2.3 banlist across all bullet text | 20 |
| `url_whitelist` | Every Markdown link URL appears in `units[*].source_url` or `.article_url` | 20 |
| `url_article_quality` | ≥ 80% of cited URLs are article-level (path depth ≥ 3, not listing root) | 15 |
| `unit_recall_vs_gold` | ≥ 60% of `gold.source_unit_ids` covered, OR for bullets ≥ 15 chars: embedding similarity ≥ 0.82 to a gold bullet. **Embedding model:** `openai/text-embedding-3-small` via OpenRouter (same as production). Recalibrate threshold if model changes. | 20 |
| `cross_village_purity` | 0 bullets citing a unit with `location.city != village_id` | 10 |

**Aggregate** = weighted sum / 100. **Pass** = aggregate ≥ 70 per fixture, ≥ 75 average across all.

### 4.3 Harness

**Scope honestly.** The refactor extracts **only the LLM-compose step** from `bajour-auto-draft/index.ts` into a pure function:

```ts
// _shared/compose-draft.ts
export async function composeDraftFromUnits(input: {
  village_id: string;
  village_name: string;
  today: string;
  selected_units: UnitForCompose[];
  prompts: { compose_layer2: string };
}): Promise<Draft>
```

Selection, save, mark-used, WhatsApp send stay in the edge function. This is the cut — the selection LLM call does NOT become pure in this refactor. Benchmark fixtures provide `selected_units` directly.

**Phase 0 exit criterion.** Golden-path integration test: `bajour-auto-draft/index.ts` test harness calls the extracted pure function and verifies the edge function's end-to-end behaviour (DB writes, mark-used updates, WhatsApp dispatch) is unchanged against a mocked DB + WhatsApp. Without this test, the refactor ships without gating the regression surface.

**CLI:**

```bash
npm run bench:dorfkoenig                              # all fixtures
npm run bench:dorfkoenig -- --fixture arlesheim-2026-04-20
npm run bench:dorfkoenig -- --model anthropic/claude-sonnet-4-5
npm run bench:dorfkoenig -- --prompt-override ./my-compose.md
npm run bench:dorfkoenig -- --output ./report.json
```

**Determinism.** Benchmark runs at `temperature: 0`. Production stays at `temperature: 0.2`. Trade-off: bench measures structural/citation properties which are stable across temps; production keeps mild creativity for prose variety.

### 4.4 CI gate (warn-only)

GitHub Actions workflow `bench-dorfkoenig`. Trigger: `on: pull_request` (NOT `pull_request_target` — forks don't get secrets, which is correct).

Runs on PRs that touch: `_shared/prompts.ts`, `*-extraction-prompt.ts`, `bajour-auto-draft/**`, `compose/**`, `_shared/draft-quality.ts`, `_tests/fixtures/**`, `_shared/compose-draft.ts`.

**Behaviour.** Runs bench, posts **scores only** (never prompts/responses) as PR comment. Does not block merge. Secrets: `OPENROUTER_API_KEY` = low-budget project key. Hard cap: `BENCH_MAX_TOKENS_PER_RUN=10000` (env var, enforced in `run.ts`).

**Model swap gating.** After Phase 1 ships, run the benchmark with both `gpt-4o-mini` and `anthropic/claude-sonnet-4-5`. Ship Sonnet 4.5 to production only if ALL of the following hold:

- `unit_recall_vs_gold` improves by ≥ 10%
- `url_article_quality` improves by ≥ 10%
- `no_filler` improves by ≥ 10%
- No other metric regresses by > 5%

At `temperature: 0` the run is deterministic; no N=3 median needed. The named subset is chosen because `url_whitelist`, `bullet_count`, `cross_village_purity` saturate to pass/fail near 100% once deterministic validators land — they wouldn't move 10% either way and would mask genuine gains.

If the gate fails, keep `gpt-4o-mini` and revisit after more feedback accumulates.

---

## 5. Production metrics capture

Same metrics as §4.2 minus `unit_recall_vs_gold` (no gold for prod drafts). Computed inline at end of `bajour-auto-draft/index.ts` and `compose/index.ts`, after §3.5 validators, before response. Pure TS, ~5ms.

### 5.1 Storage

```sql
CREATE TABLE draft_quality_metrics (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id        UUID NOT NULL REFERENCES bajour_drafts(id) ON DELETE CASCADE,
  village_id      TEXT NOT NULL,
  computed_at     TIMESTAMPTZ DEFAULT NOW(),
  metrics         JSONB NOT NULL,
  aggregate_score INT NOT NULL,
  warnings        TEXT[] DEFAULT '{}',
  schema_version  INT NOT NULL
);
CREATE INDEX idx_quality_village_date ON draft_quality_metrics (village_id, computed_at DESC);
```

RLS: service_role ALL, authenticated users SELECT their own.

### 5.2 Weekly summary SQL function

Instead of a Svelte dashboard + cron + alerts, one SQL function Tom runs weekly:

```sql
CREATE FUNCTION weekly_quality_summary()
RETURNS TABLE (
  village_id TEXT,
  drafts_last_7d INT,
  drafts_last_28d INT,
  empty_drafts_last_7d INT,
  mean_score_7d NUMERIC,
  mean_score_28d NUMERIC,
  delta_sigma NUMERIC,
  top_warning TEXT,
  pilot_fixture_missing BOOLEAN
) LANGUAGE SQL STABLE AS $$
  WITH base AS (...)
  SELECT
    village_id,
    count_7d, count_28d,
    empty_count_7d,
    mean_7d, mean_28d,
    (mean_7d - mean_28d) / NULLIF(stddev_28d, 0) AS delta_sigma,
    most_common_warning_7d,
    NOT EXISTS (SELECT 1 FROM bench_fixtures WHERE village_id = ...) AS pilot_fixture_missing
  FROM base
$$;
```

Advisory threshold on output (`abs(delta_sigma) > 2` AND `count_28d >= 10`) — Tom flags rows himself; no email spam, no stddev-from-thin-data false alerts.

Tom runs `SELECT * FROM weekly_quality_summary()` into Obsidian weekly. When the pilot grows past 20 villages or cadence hurts, the follow-up spec in §8 promotes this to a dashboard.

**Files.** Migration (table + function), `bajour-auto-draft/index.ts` inline write, `compose/index.ts` inline write.

**Rollback.** Drop the inline write call in both functions (2 lines). Table harmless.

---

## 6. Rollout

Two phases. Gated by the benchmark score on the 5 fixtures.

### Phase 0 — Foundation (3d)

**Ships:**
- `_tests/fixtures/drafts/` — 5 fixtures (§4.1)
- `_tests/bench/` — runner + metrics + CLI
- `_shared/draft-quality.ts` — palette, banlist (validator implementations land in Phase 1)
- `_shared/compose-draft.ts` — pure `composeDraftFromUnits` (compose step only, §4.3)
- Golden-path integration test for the refactor (exit criterion)
- GitHub Actions workflow (warn-only)
- `BENCH_MAX_TOKENS_PER_RUN` cap enforced in `run.ts`

**Exit criteria.** Benchmark runs, produces report. Current pipeline baseline score recorded. Integration test passes.

**Rollback.** New files, no runtime change. Revert the refactor in one PR.

### Phase 1 — Everything substantive (~7d)

**Ships:**
- §3.1 schema + `kind` caps + §3.1.4 empty-path admin emails
- §3.2 compound filter + quality score
- §3.3 extraction enrichments
- §3.4 prompt hardening (anti-pattern table inlined; no feedback retrieval)
- §3.5 four validators
- §3.6 version constants + PR template
- §3.7 feedback capture (capture-only; sanitisation; positive seed backfill; markdown ingest script)
- §5.1 `draft_quality_metrics` table + inline write
- §5.2 `weekly_quality_summary()` SQL function

**Single migration** for all new columns/tables, in this order:
1. `bajour_drafts.schema_version`, `bajour_drafts.bullets_json`
2. `information_units.quality_score`, `.publication_date`, `.sensitivity`, `.is_listing_page`, `.article_url`
3. `user_prompts.based_on_version`
4. `bajour_feedback_examples` (new) + RLS + index
5. `draft_quality_metrics` (new) + RLS + index
6. `weekly_quality_summary()` function
7. Seed inserts for `bajour_feedback_examples` (positive examples)

**Prompt version bumps:** `draft_compose`, `web_extraction`, `zeitung_extraction` — all in same PR.

**Extraction re-run cost.** Bumping extraction versions invalidates content-hash cache → one-time re-extraction of all active units over the next scout cycle. Document expected $ and wallclock in the migration PR.

**Model swap gate.** After Phase 1 prod-soak stabilises (1 week), run `bench:dorfkoenig` with both models. If §4.4 gate passes, ship one-line model constant swap in a follow-up PR.

**Exit criteria.**
- Benchmark aggregate improves ≥ 15 points vs. Phase 0 baseline
- No single-fixture score regresses > 5 points
- No `capture_skipped_legacy_schema` warnings in logs for ≥ 3 days of prod drafts
- Weekly `weekly_quality_summary()` returns sensible shape on real data

**Rollback.** Feature flags: `VITE_FEATURE_BULLET_SCHEMA`, `use_quality_gating`, `draft_validation`, `feedback_capture_enabled`, `feature_empty_path_email`. Each independently revertable. Schema changes all additive.

### Effort estimate

| Phase | Eng days | Cumulative |
|---|---|---|
| 0 | 3 | 3 |
| 1 | 7 | 10 |

~2 weeks engineering + 1 week soak before running the model-swap gate.

---

## 7. Rollback

- All schema changes are additive (columns, tables, functions). No drops, no non-null-on-existing-rows, no enum narrowings.
- Prompt changes revert via `DEFAULT_PROMPT_VERSIONS` downgrade → content-hash cache invalidates → next runs use previous prompts.
- Model swap reverts via one-line constant change.
- Feature flags gate each substantive piece (`VITE_FEATURE_BULLET_SCHEMA`, `use_quality_gating`, `draft_validation`, `feedback_capture_enabled`, `feature_empty_path_email`). Flipping a flag off is always safe; new writes fall back to pre-change behaviour, old rows remain readable.

---

## 8. Deferred / out of scope

Tracked as follow-up notes in `src/dorfkoenig/specs/followups/`:

| Deferred | Why not now | Unblocked when | Follow-up note |
|---|---|---|---|
| **Self-learning system** (retrieval of captured feedback, per-village eval loops, automated prompt tuning, approval UI) | Capture only in current scope. Retrieval/activation needs its own scope with eval design. | Capture has accumulated ≥ 3 months of data AND Tom has a hypothesis to test. | `specs/followups/self-learning-system.md` |
| **Prompt editor UI** (3-pane editor, delta-based overrides, applyDelta logic) | Large UI surface with zero impact on quality metrics. The admin SQL + PR discipline (§3.6) covers the 20-village case. | Pilot exceeds 50 villages OR multiple editors per village. | `specs/followups/prompt-editor-ui.md` |
| **Quality dashboard** (Svelte route, charts, alert table) | `weekly_quality_summary()` + Obsidian covers the weekly review at 20-village scale. | Pilot exceeds 50 villages OR cadence exceeds daily. | `specs/followups/quality-dashboard.md` |
| **Canary rollout** (2-village A/B on new prompts) | Needs ≥ 4 weeks of baseline metrics to compute rejection-rate deltas. | Phase 1 + 4 weeks baseline. | `specs/followups/canary-rollout.md` |
| **Per-village voice profiles** | Needs ≥ 3 months per-village feedback. | Phase 1 + 3 months. | `specs/followups/per-village-voice.md` |
| **Neighbour-Gemeinde relevance map** | Editorial decision, not code. | Tom + editors decide. | `specs/followups/neighbour-map.md` |
| **Two-pass LLM critique** | Adds cost + latency; deterministic validators cover observed failures. Revisit if Phase 1 metrics plateau. | Post Phase 1 metric review. | `specs/followups/two-pass-critique.md` |
| **Editor manual-edit UI pre-publish** | Separate product scope. | Separate spec. | `specs/followups/editor-manual-edit-ui.md` |
| **`validateDuplicateBullets`** | At n=2–4 bullets and temp 0.2, dupes are rare; embedding-per-bullet cost not justified yet. | If prod metrics show > 5% dupe rate. | (inline, no note yet) |
| **`validateDateHygiene` (prose date parsing)** | Parsing German relative dates from prose is NLP-in-regex-costume. §3.2 pre-filter handles the upstream concern. | If date-leak incidents recur. | (inline, no note yet) |

Only `self-learning-system.md` is written in this pass — it's the most load-bearing follow-up because it's what the §3.7 capture feeds. Other follow-up notes are created as they become imminent.

---

## 9. Success metrics

Measured 4 weeks after Phase 1 ships, from `draft_quality_metrics` + `bajour_drafts`:

| Metric | Target | Source |
|---|---|---|
| Editor rejection rate (WhatsApp `abgelehnt`) | < 20% per village per week | `bajour_drafts.verification_status` |
| URL-citation validity rate | 100% | `metrics.url_whitelist` |
| Forbidden-phrase rate | 0% | `metrics.no_filler` |
| Empty-draft rate (`bullets=[]`) | < 15% (healthy signal, not failure) | `bajour_drafts.bullets_json` |
| Empty-day admin emails received | matches `empty_drafts_last_7d` from `weekly_quality_summary()` | Admin inbox spot-check |
| Cross-village purity | 100% | `metrics.cross_village_purity` |
| Weekly benchmark aggregate (on frozen fixtures) | ≥ 80/100 | `bench:dorfkoenig` |
| Mean aggregate score on production drafts | ≥ 70 weekly | `draft_quality_metrics.aggregate_score` |
| `capture_skipped_legacy_schema` counter | = 0 after schema-v2 rollout | webhook logs |

Targets missed for 2 consecutive weeks → open a remediation spec. Targets hit → lock as the new floor.

---

## Appendix: Open question

**Emoji palette.** Approved 2026-04-22 (`🏠 🏗️ 🗳️ 🚗 🚧 📚 🎶 🌿 ⚖️ 🏢 👤 📍 📅 🐈 ⚠️ ✅`).
