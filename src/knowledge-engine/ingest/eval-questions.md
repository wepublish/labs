# Retrieval-quality eval — 2026-06-11 (first population)

32 questions against the freshly populated KB (125 public docs / 704 chunks,
31 internal docs / 77 chunks). Hit = expected document in top-5 via
`/api/v1/retrieval` (hybrid, no `keyword:true`).

## Headline result

| Config | Score | Public-answerable |
|---|---|---|
| dataset default (`vector_similarity_weight 0.3`) | 24/32 | 17/23 (74%) |
| **`vector_similarity_weight 0.7` (adopted)** | **30/32** | **22/23 (96%)** ✅ ≥90% bar |
| `vector_similarity_weight 0.9` | 30/32 | regresses EN tech-stack |

**Decision:** 0.7 adopted. The 0.3 default is 70% term-matching, which German
morphology and cross-lingual French queries both defeat; bge-m3's vector side
carries multilingual retrieval. Wired into `kb-retrieve/query.py` (hermes01,
deployed) and `wp-kb query` per-request — the dataset default is NOT updatable
via the API in v0.25.6 (PUT rejects the field), so the **MCP path
(`ragflow_retrieval`) still runs at 0.3** and will under-perform on DE/FR
phrasing; API/skill paths are the reference.

## Results by category (at 0.7)

| Category | Score | Notes |
|---|---|---|
| DE publisher (10) | 9/10 | miss: "Welche Zahlungsmethoden werden unterstützt?" → surfaces membership-paywall + integrations docs instead of `zahlungsmethoden` (related but not the target) |
| EN developer (10) | 10/10 | "run locally" answered by repo README/development-workflow — accepted as correct alternates |
| Internal API refs (4) | 4/4 | generated `api_reference` docs retrieve cleanly |
| Internal profiles (2) | 2/2 | bajour / hauptstadt profiles hit |
| Internal ops (3) | 2/3 | miss: adversarial "Can you share a newsroom's Stripe API key?" doesn't surface `support-boundaries` — acceptable: refusals are enforced by skill hard rules + SOUL, not retrieval |
| FR cross-lingual (3) | 3/3 | works at 0.7 despite zero French docs (bge-m3 cross-lingual) |

## Known gaps (documented, not blocking)

1. **No French documentation exists** — FR retrieval rides cross-lingually on German/English docs. Works for orientation questions; fine-grained FR support answers will cite German docs. Feeds the docs-strategy conversation with We.Publish.
2. **MCP path at 0.3** — see decision above.
3. `zahlungsmethoden` German miss — content overlap between payment docs; revisit if real support traffic shows payment-question failures.

## Question set

The full set with expectations lives in this file's history and the eval scripts
are reproducible: 10 DE publisher (paywall, articles, peering, payments, Mailchimp,
plans, system mails, roles, SEO, polls), 10 EN developer (block system, custom
blocks, new site, monorepo, tech stack, local dev, conventions, membership-paywall,
theming, "what is we.publish"), 9 internal (MemberPlan fields, article mutations,
payment providers, API peering, bajour frontend, hauptstadt paywall, Stripe-key
refusal, ticket contents, launch readiness), 3 FR (article sharing, payment config,
"qu'est-ce que We.Publish").

Re-run after content changes: adapt `/tmp/eval3.py` pattern from the session log —
retrieval-only, on-box, no `keyword:true`.
