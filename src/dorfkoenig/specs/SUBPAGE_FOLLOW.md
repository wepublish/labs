# Subpage-follow for web scouts (listing-page mechanism)

Portable spec. Written stack-agnostic so the same mechanism can be ported to sibling projects (coJournalist, future scout variants). Dorfkoenig-specific file paths are only referenced in §11.

## 1. Problem

A scout configured with an **index / listing URL** (e.g. `https://www.baselland.ch/politik-und-behorden/regierungsrat/medienmitteilungen/`) extracts zero information units. The page contains titles + teasers + links to individual article subpages, but no article bodies. The extraction LLM correctly refuses to invent facts from teasers and returns `units:[]`, which is the right call at the prompt level — but the downstream follow-up (open each linked article, extract from its body) does not exist for web scouts.

## 2. Algorithm (Phase B)

After the normal extraction pass on the index URL (Phase A) returns `isListingPage: true`:

```
1. links        ← extractLinksFromHtml(rawHtml, scout.url)
2. candidates   ← filter(links, sameHost AND pathStartsWith(indexPath + '/')
                                  AND noTraversal AND validateDomain)
3. seen         ← SELECT DISTINCT source_url FROM <units table>
                     WHERE scout_id = $1 AND source_url IS NOT NULL
4. fresh        ← (candidates − seen)[0 : CAP]        # CAP = 10
5. for url in fresh (sequential, delay between each):
     md ← scrape(url, formats:[markdown])
     result ← extract(md, {sourceUrl: url, scout context})
     if result.isListingPage: skip             # single-hop, do NOT recurse
     else: store result.units
6. log: "Phase B: processed N/M subpages (K units, F failed)"
```

Phase B is skipped when Phase A did not flag a listing. Notification / email logic still fires on Phase A's summary; Phase B units are stored silently for later use in the draft-composition panel (or equivalent).

## 3. Contract with the extraction LLM

The extraction prompt must return:

```json
{
  "units":         [ ... 0 or more unit objects ... ],
  "skipped":       [ ... reason strings ... ],
  "isListingPage": true | false
}
```

On a listing page: `units = []`, `skipped ⊇ ["listing_page"]`, `isListingPage = true`. The prompt must tell the LLM *not* to fabricate units from index teasers. See the "LISTENSEITEN-VERWEIGERUNG" rule in the Dorfkoenig web-extraction prompt for exact phrasing.

## 4. Link-filtering rules

| Rule | Purpose |
|---|---|
| Same host as the index URL | Stay on the scout's chosen site |
| URL path starts with `indexPath + '/'` | Only follow sub-routes under the index, avoid leaking to unrelated sections |
| Reject `..` or encoded `%2e%2e` in path | Block traversal attempts |
| `validateDomain` passes (rejects IP literals, localhost, reserved hostnames) | Belt-and-suspenders SSRF guard |
| Denylist of static-asset extensions (`.css`, `.js`, `.png`, …) | Don't waste a scrape on non-article content |
| Denylist of non-HTTP schemes (`mailto:`, `javascript:`, …) | Obvious |
| Dedup within one run | Avoid double-fetching the same article linked twice on the index |
| Cap at N = 10 per run | Bound cost + rate-limit pressure |

## 5. Dedup across runs

**Derive the seen-URL set from existing unit storage, not a new column.** Query `SELECT DISTINCT source_url FROM <units table> WHERE scout_id = $1 AND source_url IS NOT NULL`. Scout table stays unchanged — no migration required.

Tradeoff: a subpage that produces zero units leaves no row, so the next run will re-scrape it (one wasted Firecrawl credit per empty subpage per run). Acceptable for the current use case. Revisit if a long tail of empty subpages becomes visible.

## 6. Security posture

- **SSRF on initial scrape.** Already the existing risk surface — the scout owner chose the URL.
- **SSRF on subpage scrapes (redirect-based).** Extracted link passes `validateDomain` before scraping. If the scraper service follows redirects server-side and the destination resolves to a link-local IP, the scraper's egress policy is the last line of defense. Firecrawl's cloud infrastructure runs outside your network, so RFC1918 exfil is their problem; document the assumption in code.
- **Traversal.** Path filter blocks `..` literals and percent-encoded variants. Browsers/normalizers on the Firecrawl side further strip these.
- **Rate limits.** Insert a small delay (`firecrawlDelay()` in Dorfkoenig, ~stagger ms) between subpage scrapes. No concurrency — sequential only.
- **Cost.** Hard cap (10) × scout count per dispatch tick. Scout dispatcher's existing jitter handles cross-scout coordination.

## 7. Explicit non-goals

- **No recursion.** Subpages that themselves return `isListingPage: true` are skipped, not expanded. Single-hop only.
- **No scout-level opt-in/opt-out flag.** The LLM signal drives behavior. Users who want index-only summaries change the scout URL (or stop the scout).
- **No new column / migration.** Seen-URL set derives from existing unit storage.
- **No unit-test file for the link filter.** The filter is four predicates; the benchmark (§9) exercises the end-to-end path and is the load-bearing check.

## 8. Residual risks (accept for v1)

| Risk | Mitigation available | Decision |
|---|---|---|
| Crash mid-loop re-scrapes some subpages next run | Cross-run unit dedup (cosine + trigram) absorbs content collisions. Firecrawl credits wasted are bounded by CAP. | Accept. Don't pre-optimize. |
| Subpages with zero units → no `source_url` row → re-scraped every run | Could add a "skipped_subpage_urls" list on scout. | Accept for v1. Revisit if visible in usage. |
| `extractLinksFromHtml` regex misses `href='...'` and unquoted hrefs | Would need a proper HTML parser. | Accept — matches known-good pages. |
| Attacker-controlled indexed site serves links to any same-host internal page | Same-host path-prefix filter narrows. | Accept — owner chose host. |

## 9. Verification recipe

One end-to-end benchmark that must assert, for the real-world URL the feature was built for:

1. Scrape the index URL with `formats:[markdown, rawHtml]` — both must be non-empty.
2. Run the extraction LLM on the markdown — `isListingPage` must be `true`.
3. Extract links from the rawHtml — non-zero count.
4. Filter with the rules from §4 — non-zero count.
5. For each of the first 10 candidates, scrape markdown + run extraction.
6. Assert **total units across subpages ≥ 3** (tunable, but meaningful for the target site).

The benchmark must not touch the database — it exercises only the scrape + LLM path. The integration step is covered by the usual "run the scout from the UI" E2E.

## 10. Port notes (translate this to your stack)

Before porting, identify the local equivalents of:

| Dorfkoenig thing | Your project's equivalent |
|---|---|
| `firecrawl.scrape(url, {formats:[markdown, rawHtml]})` | Your scraping client, both markdown + HTML in one call |
| `extractLinksFromHtml` | Any regex- or parser-based same-host link extractor |
| `validateDomain` | Hostname validator rejecting IPs, localhost, reserved names |
| `extractInformationUnits` returning `{insertedCount, isListingPage}` | Your extraction pipeline — it must propagate the LLM's `isListingPage` up, not swallow it |
| Web-extraction prompt emitting `isListingPage` | Update your prompt schema + tests |
| `information_units.source_url` column as dedup source | Any table that stores the source URL per extracted artefact |
| `execute-scout` Phase B wiring | Your scout runner's post-extraction hook |

Keep the CAP small (10) and the single-hop invariant. These are the two knobs that keep cost bounded in the worst case.

## 11. Dorfkoenig-specific file references

- Extraction prompt refusal rule: `supabase/functions/_shared/web-extraction-prompt.ts` (`LISTENSEITEN-VERWEIGERUNG`)
- Link filter + domain check + delay: `supabase/functions/_shared/civic-utils.ts`
- Scrape client: `supabase/functions/_shared/firecrawl.ts`
- Extraction surface: `supabase/functions/_shared/unit-extraction.ts` (returns `{insertedCount, isListingPage}`)
- Phase B wiring: `supabase/functions/execute-scout/index.ts` (Step 6b)
- Benchmark: `scripts/benchmark-subpage-follow.ts` (`npm run benchmark:subpages`)
