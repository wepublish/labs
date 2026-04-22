# Editor feedback — markdown intake

Drop weekly feedback into `src/dorfkoenig/docs/feedback/{village_id}/{YYYY-MM-DD}.md`, then run:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run ingest:feedback -- --file src/dorfkoenig/docs/feedback/arlesheim/2026-04-22.md
```

Add `--dry-run` to preview without writing.

## Format

```markdown
# Headline (ignored, optional)

+ 🏠 Positive example text exactly as it should look in a future draft.
+ 🏗️ Another positive example …

- "Quoted bad draft text" → Grund / reason in a short clause
- "Another bad example without a reason"
```

- Lines starting with `+` → `kind='positive'` (what the draft should produce).
- Lines starting with `-` → `kind='negative'` (what the draft should avoid).
- `→` separates the bad text from the reason — optional.
- Comments (`#` lines) and blank lines are ignored.

## Sanitisation

Every bullet runs through `_shared/feedback-sanitise.ts` before insertion:

- Length 20–400 chars after stripping markdown links/code fences/HTML tags.
- Rejected on instruction-shaped text (`ignoriere`, `you are`, `system:`, boundary markers).
- Rejected on non-Latin runs ≥ 8 chars.

A rejection is logged with its reason and the bullet is skipped. The rest of the file still ingests.

## What the data is used for (today vs. later)

**Today:** Nothing automatic. Rows sit in `bajour_feedback_examples` for eventual activation.

**Later** (`specs/followups/self-learning-system.md`): per-village few-shot retrieval in the compose prompt, evals, drift alerts. Activation is a separate spec — the sanitisation and schema are already ready so the backlog is clean when it's time.

## Directory convention

```
src/dorfkoenig/docs/feedback/
├── README.md
├── arlesheim/
│   ├── 2026-04-22.md
│   └── 2026-05-06.md
└── muenchenstein/
    └── 2026-04-29.md
```

Keep files small (one edition per file). The filename date is captured as `edition_date`; the parent directory as `village_id`.
