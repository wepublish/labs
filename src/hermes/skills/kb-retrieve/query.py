#!/usr/bin/env python3
"""Scoped retrieval from the We.Publish knowledge base (RAGFlow). Stdlib only.

Fail-closed rules enforced HERE, not in the prompt:
  - every queried dataset must be in RAGFLOW_ALLOWED_DATASET_IDS (the profile's
    readable namespaces); no flag can widen the scope
  - never passes keyword:true (retrieval-only deployment — no chat LLM in RAGFlow)

Endpoint (RAGFlow v0.25.x — verify on upgrade):
  POST /api/v1/retrieval   {question, dataset_ids, page_size, similarity_threshold}
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def die(msg):
    print(f"[kb-retrieve][FATAL] {msg}", file=sys.stderr)
    sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--question", required=True)
    p.add_argument("--dataset-id", action="append", default=[],
                   help="repeatable; default = every allowed dataset")
    p.add_argument("--top-n", type=int, default=8)
    p.add_argument("--min-score", type=float, default=0.2,
                   help="similarity threshold (RAGFlow default 0.2)")
    a = p.parse_args()

    base = os.environ.get("RAGFLOW_BASE_URL") or die("RAGFLOW_BASE_URL not set")
    key = os.environ.get("RAGFLOW_API_KEY") or die("RAGFLOW_API_KEY not set")
    allowed = [d.strip() for d in os.environ.get("RAGFLOW_ALLOWED_DATASET_IDS", "").split(",") if d.strip()]
    if not allowed:
        die("RAGFLOW_ALLOWED_DATASET_IDS not set — refusing to query anywhere")

    targets = a.dataset_id or allowed
    blocked = [d for d in targets if d not in allowed]
    if blocked:
        die(f"dataset(s) {blocked} not in allowlist — refusing")

    body = json.dumps({
        "question": a.question,
        "dataset_ids": targets,
        "page_size": a.top_n,
        "similarity_threshold": a.min_score,
    }).encode()
    req = urllib.request.Request(
        f"{base.rstrip('/')}/api/v1/retrieval", data=body, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        resp = json.loads(e.read() or b"{}")
    except OSError as e:
        die(f"cannot reach RAGFlow at {base}: {e}")

    code = resp.get("code")
    if code == 102:  # "No chunk found" — empty result, not an error
        print(json.dumps({"ok": True, "question": a.question, "dataset_ids": targets, "chunks": []}))
        return
    if code != 0:
        die(f"retrieval failed: {json.dumps(resp)[:300]}")

    data = resp.get("data") or {}
    chunks = []
    for c in data.get("chunks") or []:
        chunks.append({
            "content": c.get("content"),
            "similarity": c.get("similarity"),
            "document": c.get("document_keyword") or c.get("docnm_kwd"),
            "document_id": c.get("document_id"),
            "dataset_id": c.get("dataset_id") or c.get("kb_id"),
        })
    print(json.dumps({"ok": True, "question": a.question, "dataset_ids": targets,
                      "total": data.get("total"), "chunks": chunks}, ensure_ascii=False))


if __name__ == "__main__":
    main()
