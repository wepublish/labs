---
name: kb-ingest
description: Push knowledge into the We.Publish knowledge base (RAGFlow) with enforced schema-on-ingest tagging. Use when asked to ingest, save, or store knowledge — docs, support patterns, decisions, newsroom setup info — into the KB. Chat-driven; the deterministic script owns the write.
---

# KB Ingest — hardened write path to RAGFlow

You never call the RAGFlow API directly. All writes go through `push_chunk.py`, which
validates tags and fails closed. Your job: collect the content, determine the right
tags by asking the user if unclear, then run the script.

## Schema (every chunk)

| Tag | Values | Rule |
|---|---|---|
| dataset | a dataset ID from `RAGFLOW_ALLOWED_DATASET_IDS` | the namespace; script refuses anything else |
| `type` | `doc` / `support_pattern` / `decision` / `media_profile` / `setup_summary` / `architecture` / `issue_summary` | required |
| `source` | URL, system name, or `newsroom-asserted` | required — no source, no ingest |
| `confidence` | `confirmed` / `likely` / `unverified` | `confirmed` requires `--reviewed-by` (a human name). Never invent one. |
| `owner` | team or person responsible | required |
| `newsroom` | slug | only for newsroom-related chunks |
| `last_updated` | — | set automatically by the script |

## Hard rules

1. **Never promote to `confirmed` yourself.** Only pass `--reviewed-by` when a human
   explicitly states they reviewed the content in this conversation.
2. **Newsroom-provided knowledge** is always `--source newsroom-asserted --confidence
   unverified` — useful immediately, reviewed by IT later. (In support profiles the
   script forces these via env regardless of what you pass.)
3. **Never ingest**: credentials, payment data, member data, live CMS state. Refuse and
   point to the CMS.
4. One topic per chunk. Split mixed content; don't dump raw threads — summarize first
   and show the user the summary before ingesting.

## Usage

```bash
python3 push_chunk.py \
  --dataset-id <id> \
  --title "Peering setup: token + User-Agent requirements" \
  --type support_pattern \
  --source "https://github.com/wepublish/wepublish/issues/1234" \
  --owner support \
  --confidence likely \
  --content-file /tmp/chunk.md
```

The script uploads the chunk as a document, sets its metadata, and triggers parsing.
On success it prints the document ID — report it to the user with the tags used.

## Env contract (per profile)

`RAGFLOW_BASE_URL`, `RAGFLOW_API_KEY`, `RAGFLOW_ALLOWED_DATASET_IDS` (comma-separated
allowlist — the profile's writable namespaces). Optional hardening, set in support
profiles: `RAGFLOW_FORCE_SOURCE=newsroom-asserted`, `RAGFLOW_FORCE_CONFIDENCE=unverified`.
