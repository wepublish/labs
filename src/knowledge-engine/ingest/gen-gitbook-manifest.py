#!/usr/bin/env python3
"""Generate manifest-gitbook.json from the gitbook-wepublish-doc clone.

SUMMARY.md is the canonical list of *published* pages (unlisted files are drafts).
Each entry maps a repo file to its docs.wepublish.ch URL, tagged per KTD7:
confidence=confirmed, reviewed_by=wepublish-docs (official published documentation).

Usage: gen-gitbook-manifest.py /tmp/gitbook-wepublish-doc > manifest-gitbook.json
Refresh: git -C <clone> pull && re-run, then kb-bulk --manifest manifest-gitbook.json
"""

import json
import os
import re
import sys

clone = sys.argv[1]
summary = open(os.path.join(clone, "SUMMARY.md")).read()

entries, section, seen = [], "Start", {}
for line in summary.splitlines():
    m_sec = re.match(r"^##\s+(.*)", line)
    if m_sec:
        section = m_sec.group(1).strip()
        continue
    m = re.match(r"^\s*\*\s+\[(.*?)\]\((.*?)\)", line)
    if not m:
        continue
    title, path = m.group(1).strip(), m.group(2).strip()
    if not os.path.isfile(os.path.join(clone, path)):
        print(f"[gen] WARNING: listed but missing: {path}", file=sys.stderr)
        continue
    url_path = re.sub(r"(/?README)?\.md$", "", path)
    url = "https://docs.wepublish.ch" + (("/" + url_path) if url_path else "")
    full_title = f"{title} – {section}"
    if full_title in seen:  # disambiguate rare same-title pages within a section
        full_title = f"{title} ({os.path.dirname(path).split('/')[-1]}) – {section}"
    seen[full_title] = path
    entries.append({
        "file": f"gitbook:{path}",
        "title": full_title,
        "dataset": "public",
        "type": "doc",
        "source": url,
        "owner": "wepublish-docs",
        "confidence": "confirmed",
        "reviewed_by": "wepublish-docs",
    })

print(json.dumps(entries, indent=1, ensure_ascii=False))
print(f"[gen] {len(entries)} published pages", file=sys.stderr)
