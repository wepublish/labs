# Automatische Entwuerfe -- Taeglicher Ablauf

## Overview

Every day, Dorfkoenig automatically generates one newsletter draft (KI-Entwurf) per village, sends it to correspondents for WhatsApp verification, and makes confirmed drafts available to the CMS via the News API. The entire process runs unattended.

## Daily Schedule

| Time (Zurich) | What happens |
|---------------|--------------|
| **18:00** | `dispatch_auto_drafts` fires -- one edge function call per village (10 total, or fewer during the pilot, see "Pilot allow-list" below) |
| **18:00--18:05** | Per village: select units, generate draft, save, send WhatsApp verification |
| **18:05--21:00** | Correspondents can respond via WhatsApp (bestaetigt/abgelehnt) |
| **21:00** | Timeout sweep: any draft still "ausstehend" is auto-confirmed (bestaetigt) |
| **22:00** | CMS queries the News API and publishes confirmed drafts |

## Per-Village Pipeline

For each of the 10 villages, the `bajour-auto-draft` edge function runs these steps:

### 1. Idempotency Check

If a draft already exists for this village and today's date (that has not been rejected), the pipeline skips. This prevents duplicate drafts if the function is triggered more than once.

### 2. Select Information Units

The system queries all unused information units for the village's scout from the last 2 days (RECENCY_DAYS = 2), up to 100 candidates. An LLM (GPT-4o-mini) then selects the 5--15 most relevant units using the `INFORMATION_SELECT_PROMPT`, which prioritizes:

1. Recency (last 2 days strongly preferred)
2. Relevance to village residents
3. Topic diversity (politics, culture, infrastructure, society)
4. Novelty (first reports over ongoing developments)

Selected units are capped at 20 (MAX_UNITS_PER_COMPOSE). If the LLM returns an empty selection, the system falls back to using the first 20 units.

### 3. Generate Draft

A second LLM call generates the newsletter using the `DRAFT_COMPOSE_PROMPT`, which enforces:

- Start every section with the most important fact
- Bold important numbers, names, and dates
- Short sentences (max 15--20 words)
- Inline source citations in `[source.ch]` format
- Emoji-prefixed bullet points

The output is a structured JSON with title, greeting, sections, outlook, and sign-off, which is converted to markdown.

### 4. Save Draft

The draft is saved to `bajour_drafts` with:
- `publication_date` = today (Zurich timezone)
- `verification_status` = "ausstehend"
- Selected unit IDs are recorded and units are marked as used

### 5. Send WhatsApp Verification (Non-Fatal)

The draft is sent to all active correspondents for the village via WhatsApp. If the WhatsApp send fails, the draft is still saved -- verification can be done manually or will auto-confirm at 21:00.

### 6. Log to auto_draft_runs

Every execution is logged to the `auto_draft_runs` table with status: `completed`, `skipped`, or `failed`.

## What Happens When There Are No Units

If a village has no unused information units from the last 2 days, the pipeline gracefully skips that village. The run is logged with status `skipped` and reason "No unused units available." No draft is created and no WhatsApp message is sent.

## Timeout Sweep (21:00)

At 21:00 Zurich time, the `resolve_bajour_timeouts` function runs. Any draft with `verification_status = 'ausstehend'` that has passed its 2-hour timeout window is automatically set to `bestaetigt`. This ensures all drafts are available for the 22:00 CMS query, even if correspondents did not respond.

## The System Prompt Toggle

In the Feed panel, you can manually generate drafts with a custom system prompt. This is useful for testing how different prompts affect the output quality. The `INFORMATION_SELECT_PROMPT` controls which units are selected, and the `DRAFT_COMPOSE_PROMPT` controls the writing style. Both can be overridden per-draft in the UI.

## How to Check If It Ran

Open the Supabase Dashboard and query the `auto_draft_runs` table:

**Dashboard URL:** [https://supabase.com/dashboard/project/ayksajwtwyjhvpqngvcb](https://supabase.com/dashboard/project/ayksajwtwyjhvpqngvcb)

Navigate to **Table Editor > auto_draft_runs** and sort by `started_at` descending. Each row shows:

| Column | Meaning |
|--------|---------|
| `village_id` | Which village |
| `status` | `completed`, `skipped`, or `failed` |
| `error_message` | Why it failed or was skipped (null if completed) |
| `draft_id` | Link to the generated draft (null if skipped/failed) |
| `started_at` | When the run started |
| `completed_at` | When it finished |

You can also check `bajour_drafts` filtered by today's `publication_date` to see all generated drafts and their verification status.

## Pilot allow-list

For the launch, the daily dispatcher is gated by the optional `bajour_pilot_villages` Vault secret (comma-separated lowercase village IDs). When set, only listed villages dispatch; when missing or empty, all 10 dispatch (post-pilot default). Information extraction (web/civic scouts, manual upload) is never affected -- the backlog stays warm for every village so newly onboarded villages get useful drafts on day one.

Operators expand the list weekly via the Supabase SQL editor. The full runbook (commands to start, expand, verify, and end the pilot) lives in `src/dorfkoenig/CLAUDE.md` under "Bajour pilot allow-list (weekly expansion runbook)".

## DST Handling

The pg_cron jobs are dual-scheduled at two UTC times to handle daylight saving time changes. A timezone-safe wrapper checks whether the current Zurich hour matches before executing, so only one of the two UTC slots actually runs on any given day.
