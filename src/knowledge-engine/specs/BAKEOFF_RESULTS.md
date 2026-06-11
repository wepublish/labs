# Engine Bake-off — Outcome

Date: 2026-06-10
Decision: **RAGFlow** is the contender to proceed with.
Confidence: high (tested under both local AND cloud LLMs).

## TL;DR after the cloud-LLM re-run
With a strong cloud model (claude-haiku-4.5 via OpenRouter — the real production config), the two engines are **effectively tied on quality**: RAGFlow 96.7% / Onyx 93.3% overall, but **identical 95.5% positive correctness**, both 100% retrieval-hit, both 100% not-found, both clean isolation (Onyx's 1 flag = the X2 public-peering-doc test artifact). Quality does NOT decide this. RAGFlow wins on two **non-quality** factors that matter for the stated operating model: (1) **fully-open Apache vs Onyx open-core**, and (2) **clean headless retrieval** — RAGFlow exposes a direct `/retrieval` hybrid API; Onyx's hybrid retrieval is gated behind an agentic chat that would NOT run headlessly even with the cloud model (kept emitting `add_memory` as text, ignoring `allowed_tool_ids`), so its leg ran on keyword+full-content. Notably, Onyx's keyword retrieval still hit 100% / 95.5% on this corpus — so that limitation didn't hurt its numbers, but it's a real architectural awkwardness for a Hermes-mediated headless design.

## Cloud-LLM head-to-head (claude-haiku-4.5)

| Metric | RAGFlow | Onyx CE |
|---|---|---|
| Overall | 96.7% | 93.3% (96.7% adj. for X2 artifact) |
| Positive correctness | 95.5% | 95.5% |
| Retrieval hit | 100% | 100% |
| Isolation | 100% | effectively 100% |
| Not-found | 100% | 100% |


## How the decision was reached

Both engines were run end-to-end against the same corpus (14 scraped German docs + internal patterns + a newsroom pack incl. a brand-guide PDF), three namespaces, Hermes-style scoped retrieval, same judge, same generation model (Ollama `qwen2.5:7b`).

## Head-to-head (30 questions)

| Metric | RAGFlow | Onyx CE |
|---|---|---|
| Overall pass | **90%** | 83% |
| Positive correctness | 86% | 82% |
| Retrieval hit-rate | 100% | 100% |
| Isolation | 100% (0 leaks) | effectively 100%* |
| Not-found discipline | 100% | 100% |

*Onyx's one flagged "leak" (X2) is a test artifact: the public German peering doc legitimately lists Tsüri/Hauptstadt (real Swiss newsrooms), and Onyx's answer still correctly refused — no newsroom data leaked.

**Raw retrieval quality is close — both are strong.** The decision is not won on the numbers; it's won on operating-model fit (below).

## The decisive finding

With the **same local qwen2.5:7b**, RAGFlow's native hybrid `/retrieval` endpoint worked cleanly (90%). **Onyx's native hybrid retrieval was unusable locally** — it is gated behind an agentic chat flow that needs a strong function-calling LLM; the 7B emitted tool-calls as plain text and triggered *no search* (0 docs). Onyx's 83% was only obtainable via its **keyword** search + a workaround feeding full doc text to the generator (its API otherwise returns truncated blurbs). So: for a local / headless / small-model self-host posture — exactly We.Publish's target — RAGFlow's retrieval is directly usable; Onyx's best retrieval effectively requires a capable (cloud) LLM.

Caveat: if a strong cloud LLM ever sits behind the engine, Onyx's hybrid+agentic retrieval would likely shine and could close or reverse the gap. That contradicts the stated "local, no external cost" posture, so it doesn't change the recommendation for the current operating model.

## RAGFlow measured results (30 questions)

| Metric | Result |
|---|---|
| Overall pass | 90% (27/30) |
| Retrieval hit-rate | 100% |
| Isolation (hard gate) | 100%, 0 leaks |
| Not-found discipline | 100% |
| PDF parsing (DeepDoc) | PASS — extracted table/column-only facts |
| Positive correctness | 86% |

3 misses were "partial" answers on German public-doc questions (completeness, not retrieval failures).

## Decision factors

| Factor | Edge | Note |
|---|---|---|
| Retrieval quality | even — both strong (90% vs 83%, both 100% hit) | measured head-to-head; not the differentiator |
| **Local/headless fit** | **RAGFlow** | RAGFlow retrieval works with a local 7B; Onyx hybrid needs a strong agentic LLM. **The decider.** |
| **License / ride-upstream** | **RAGFlow** | Apache 2.0 fully-open vs Onyx open-core (RBAC/SSO/governance = EE). The user's stated tiebreaker. |
| Document parsing | RAGFlow | DeepDoc is a genuine strength; proven on the PDF |
| Multilingual (German) | even | bge-m3 handled German well in RAGFlow |
| Boot friction | Onyx | RAGFlow needed 5 one-time fixes (see below); Onyx pulled clean |
| Runtime footprint | RAGFlow | Onyx runs two model servers + OpenSearch; heavier at rest |
| amd64 on prod | even/RAGFlow | RAGFlow is amd64-only — a non-issue on the x86 Hetzner box (emulation was only a laptop concern) |

## Honest caveats

- Onyx's hybrid retrieval was not exercised (local 7B can't drive its agent); its 83% is keyword-retrieval + full-content workaround. With a cloud LLM, Onyx would likely score higher.
- Onyx's own PDF parser was not tested (its ingestion API takes text; I pre-extracted with pypdf). RAGFlow's DeepDoc parser was tested and passed.
- RAGFlow's prebuilt `v0.25.6` image **crash-loops out of the box** (missing `tools/` dir → `set -e` migration). Production deploy must bake in the fix (ship `tools/`, or set `INIT_MODEL_PROVIDER_TABLES=0` on fresh installs) — already worked out during this eval.
- Other RAGFlow setup notes captured: use the base compose (not the macOS source-build override) to pull the prebuilt image; headless auth = RSA-PKCS1v15(base64(pw)) then create a `/system/tokens` API key for `/retrieval`; don't pass `keyword:true` to `/retrieval` unless a tenant chat model is set.
- Eval corpus is indicative (synthetic newsroom + doc slice), not the full production corpus.

## Recommendation

Proceed with **RAGFlow** as the headless engine behind Hermes. It cleared the retrieval/isolation/parsing bar on the real German corpus and wins the decisive fully-open / ride-upstream criterion. Harden a deploy script that bakes in the boot fixes, then run it on a resized (CPX51) `onyx01`. Keep Onyx CE as the documented fallback if RAGFlow's maintainer momentum or a future retrieval test ever changes the picture.
