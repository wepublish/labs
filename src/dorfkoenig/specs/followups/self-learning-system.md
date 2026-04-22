# Follow-up: Self-learning system (activation of captured feedback)

> **Status:** deferred — capture pipeline exists (DRAFT_QUALITY.md §3.7), activation belongs to a future scope.
> **Depends on:** DRAFT_QUALITY.md §3.7 shipped + ≥ 3 months of captured data.
> **Blocks:** none — everything else can proceed without this.

## What this will be

The `bajour_feedback_examples` table collects rejected bullets (and Tom's markdown-file positive/negative examples) from the moment DRAFT_QUALITY.md §3.7 ships. Today that data sits dormant. This follow-up is the spec for **turning it on**:

- **Retrieval at compose time** — per-village few-shot examples pulled into the compose prompt, replacing the static anti-pattern table in DRAFT_QUALITY.md §3.4.4.
- **Activation policy** — how examples transition from `captured` to `in use` (approval gate, quality threshold, manual vs. automatic).
- **Eval loop** — weekly automated measurement of whether feedback-driven few-shots actually move quality metrics, vs. the baseline of static negatives.
- **Drift detection** — when a village's rejection rate creeps up despite more training data, surface for investigation.
- **Retention / rotation** — capping examples per village, weighting recency vs. severity, evicting stale patterns.

## Why defer

- Capture is cheap and safe without activation (data accumulates; sanitisation at write keeps it clean).
- Activation needs an eval design that doesn't exist yet — without evals, "does feedback retrieval help?" becomes a vibes question at scale.
- Tom's current feedback flow (markdown files → prompt updates → version bump) is a manual self-learning loop that works at pilot scale. Automating it before it's proven stable risks regressions across 20 villages simultaneously.
- The hard part is **activation policy** (what makes an example trustworthy enough to influence prompts): Big Tony's C1 concern means we can't auto-trust rejected bullets even after sanitisation. A separate scope can explore approval gates, quality thresholds, or whitelist-per-village.

## What must exist before writing this spec

1. **3 months of captured data** across pilot villages — enough volume to compute per-village retrieval stability.
2. **Weekly eval baseline** — DRAFT_QUALITY.md §5.2 metrics over ≥ 8 weeks, so "did activation help?" is answerable against a stable reference.
3. **Proof that sanitisation caught injection attempts** — if the 3-month window shows zero sanitisation-bypass events, the confidence budget for automation is higher. If it shows attempts, the activation policy must be stricter.

## Sketch of the spec sections (not the spec itself)

1. **Activation policy** — manual bulk approval per village vs. auto-approval with sanitisation + quality threshold vs. tiered trust.
2. **Retrieval mechanics** — query shape (`DISTINCT ON (kind)` by recency? By similarity to current unit pool? By village+weekday?), fallback to static anti-pattern table when pool is thin.
3. **Prompt integration** — fenced block with boundary markers (Big Tony: the boundary marker must be a string the sanitiser rejects verbatim in `bullet_text`), position in prompt, interaction with `DEFAULT_PROMPT_VERSIONS`.
4. **Eval design** — A/B rollout (subset of villages use retrieval, rest use static), metric: does rejection rate drop vs. static baseline? Power analysis for minimum sample.
5. **Drift alerts** — rejection-rate creep, feedback-retrieval-empty-fallback rate, sanitisation-reject rate per village.
6. **Retention / rotation** — caps, weighting, eviction.
7. **Rollback** — single flag disables retrieval, falls back to static table.
8. **Cost model** — expected OpenRouter token delta vs. current static prompt.

## Open questions (to resolve before writing)

- Is the approval gate manual, rule-based, or ML-based? (Simplest: one-line SQL per village once, full-trust thereafter.)
- Do we activate per-village on a schedule (weekly cron checks fixed threshold) or per-user (Tom flips it)?
- Should retrieval be driven by the current unit pool (semantic similarity) rather than recency? Retrieval-augmented generation is more expensive but theoretically more relevant.
- Does the eval rollout need feature-flag randomisation at the village level, or can we ship to one village and compare against its own rolling baseline?
- What's the failure mode we fear most: injection via feedback (Big Tony C1) vs. overfitting to stale patterns vs. cross-village leakage?

## What NOT to spec before ready

- UI for approval. If we end up needing manual approval, it can be SQL-only for longer than feels comfortable.
- ML fine-tuning on captured data. Overkill for this pipeline; few-shot retrieval alone is the hypothesis worth testing first.
- Cross-village example sharing. Village-specific voice is a feature, not a bug.

## Relationship to other deferred items

- **Canary rollout** (`specs/followups/canary-rollout.md`) — the eval loop here would benefit from canary infrastructure. Build canary first, or bundle.
- **Per-village voice profiles** (`specs/followups/per-village-voice.md`) — if per-village feedback retrieval works, explicit voice profiles may become redundant. Evaluate in that order.
- **Two-pass LLM critique** (`specs/followups/two-pass-critique.md`) — orthogonal; a critic model would operate on the composed draft regardless of whether the compose prompt uses retrieval.
