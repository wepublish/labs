---
name: kb-retrieve
description: Search the We.Publish knowledge base (RAGFlow) with namespace scoping enforced. Use when answering any question that might be covered by ingested knowledge — docs, support patterns, decisions, newsroom setups. Always retrieve before answering from memory.
---

# KB Retrieve — scoped read path from RAGFlow

You never call the RAGFlow API directly. All retrieval goes through `query.py`, which
pins the queryable namespaces and fails closed. Your job: phrase a good search
question, run the script, and ground your answer in what comes back.

## Usage

```bash
python3 query.py --question "How does peering authentication work?"
# narrower scope (id must be in the allowlist):
python3 query.py --question "..." --dataset-id <id>
# tune recall:
python3 query.py --question "..." --top-n 12 --min-score 0.1
```

Output is JSON: `{ok, question, dataset_ids, total, chunks: [{content, similarity,
document, document_id, dataset_id}]}`. Empty `chunks` means the KB has nothing —
that is a valid answer.

## Hard rules

1. **Ground answers in retrieved chunks.** Quote or paraphrase chunk content and name
   the source document. If `chunks` is empty, say the KB has no coverage — never fill
   the gap from your own knowledge while presenting it as KB content.
2. **Report confidence honestly.** Chunk metadata carries `confidence`
   (`confirmed` / `likely` / `unverified`) and `source` tags — surface them when the
   user is making decisions based on the answer. `newsroom-asserted` content is the
   newsroom's claim, not verified fact.
3. **Scope is policy, not preference.** The allowlist in `RAGFLOW_ALLOWED_DATASET_IDS`
   is the profile's read boundary. Never work around a refusal by switching profiles
   or asking another agent.
4. Retrieval is hybrid (vector + keyword) but the deployment has **no chat LLM** —
   never expect RAGFlow to generate answers; generation is your job.

## Env contract (per profile)

`RAGFLOW_BASE_URL`, `RAGFLOW_API_KEY`, `RAGFLOW_ALLOWED_DATASET_IDS` (comma-separated
allowlist — the profile's readable namespaces; support profiles get only
`public` + their own `newsroom:{slug}`).
