## Summary

<!-- 1–3 bullets on what changed and why. -->

## Prompt version discipline (DRAFT_QUALITY.md §3.6)

- [ ] This PR does not edit prompt text in `_shared/prompts.ts`, `_shared/web-extraction-prompt.ts`, or `_shared/zeitung-extraction-prompt.ts`.
- [ ] OR — this PR edits prompt text AND bumps the matching `DEFAULT_PROMPT_VERSIONS` / `*_PROMPT_VERSION` constant.

## Draft-quality testing

- [ ] `npm test` passes.
- [ ] If this PR touches drafting, extraction, or `bajour_drafts` schema: reviewed the `bench-dorfkoenig` CI comment (warn-only — not a blocker, but regressions should be deliberate).

## Test plan

<!-- Checklist of how you verified the change. Delete the lines that don't apply. -->

- [ ] Added/updated Deno tests under `supabase/functions/_tests/`.
- [ ] Added/updated Vitest tests under `src/dorfkoenig/__tests__/`.
- [ ] Ran the feature path end-to-end locally (note which path).
