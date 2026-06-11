#!/usr/bin/env python3
"""Hardened single-chunk ingest into RAGFlow. Stdlib only (matches deploy/ scripts).

Fail-closed rules enforced HERE, not in the prompt:
  - dataset must be in RAGFLOW_ALLOWED_DATASET_IDS
  - source + owner + type required; confidence in {confirmed, likely, unverified}
  - confidence=confirmed requires --reviewed-by
  - RAGFLOW_FORCE_SOURCE / RAGFLOW_FORCE_CONFIDENCE env override args (support profiles)

Endpoints (RAGFlow v0.25.x — verify on upgrade):
  POST /api/v1/datasets/{id}/documents          multipart upload
  PUT  /api/v1/datasets/{id}/documents/{doc_id} set meta_fields
  POST /api/v1/datasets/{id}/chunks             trigger parse {document_ids: [...]}
"""

import argparse
import datetime
import json
import os
import sys
import urllib.request
import uuid

VALID_TYPES = {"doc", "support_pattern", "decision", "media_profile",
               "setup_summary", "architecture", "issue_summary"}
VALID_CONFIDENCE = {"confirmed", "likely", "unverified"}


def die(msg):
    print(f"[kb-ingest][FATAL] {msg}", file=sys.stderr)
    sys.exit(1)


def http(method, url, key, body=None, content_type="application/json"):
    data = body if isinstance(body, bytes) else (json.dumps(body).encode() if body else None)
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def multipart(filename, content: bytes):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: text/markdown\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dataset-id", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--type", required=True, dest="chunk_type")
    p.add_argument("--source", required=True)
    p.add_argument("--owner", required=True)
    p.add_argument("--confidence", required=True)
    p.add_argument("--newsroom", default="")
    p.add_argument("--reviewed-by", default="")
    p.add_argument("--content-file", required=True)
    a = p.parse_args()

    base = os.environ.get("RAGFLOW_BASE_URL") or die("RAGFLOW_BASE_URL not set")
    key = os.environ.get("RAGFLOW_API_KEY") or die("RAGFLOW_API_KEY not set")
    allowed = {d.strip() for d in os.environ.get("RAGFLOW_ALLOWED_DATASET_IDS", "").split(",") if d.strip()}
    if not allowed:
        die("RAGFLOW_ALLOWED_DATASET_IDS not set — refusing to write anywhere")
    if a.dataset_id not in allowed:
        die(f"dataset {a.dataset_id} not in allowlist — refusing")

    # Profile-level forced tags beat whatever the model passed.
    source = os.environ.get("RAGFLOW_FORCE_SOURCE") or a.source
    confidence = os.environ.get("RAGFLOW_FORCE_CONFIDENCE") or a.confidence

    if a.chunk_type not in VALID_TYPES:
        die(f"type must be one of {sorted(VALID_TYPES)}")
    if confidence not in VALID_CONFIDENCE:
        die(f"confidence must be one of {sorted(VALID_CONFIDENCE)}")
    if confidence == "confirmed" and not a.reviewed_by:
        die("confidence=confirmed requires --reviewed-by (a human reviewer)")

    with open(a.content_file, "rb") as f:
        content = f.read()
    if not content.strip():
        die("content file is empty")

    fname = a.title.lower().replace(" ", "-")[:80] + ".md"
    body, ctype = multipart(fname, content)
    st, resp = http("POST", f"{base}/api/v1/datasets/{a.dataset_id}/documents", key, body, ctype)
    docs = resp.get("data", [])
    if st != 200 or not docs:
        die(f"upload failed ({st}): {json.dumps(resp)[:300]}")
    doc_id = docs[0]["id"]

    meta = {
        "type": a.chunk_type, "source": source, "confidence": confidence,
        "owner": a.owner, "last_updated": datetime.date.today().isoformat(),
    }
    if a.newsroom:
        meta["newsroom"] = a.newsroom
    if a.reviewed_by:
        meta["reviewed_by"] = a.reviewed_by
    st, resp = http("PUT", f"{base}/api/v1/datasets/{a.dataset_id}/documents/{doc_id}",
                    key, {"meta_fields": meta})
    if st != 200:
        die(f"metadata update failed ({st}): {json.dumps(resp)[:300]}")

    st, resp = http("POST", f"{base}/api/v1/datasets/{a.dataset_id}/chunks",
                    key, {"document_ids": [doc_id]})
    if st != 200:
        die(f"parse trigger failed ({st}): {json.dumps(resp)[:300]}")

    print(json.dumps({"ok": True, "document_id": doc_id, "dataset_id": a.dataset_id, "meta": meta}))


if __name__ == "__main__":
    main()
