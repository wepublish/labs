# Newsroom onboarding — launch-readiness checklist

Distilled from MCP_DELIVERY_SPEC (labs/src/knowledge-engine/specs/) — the checks the CMS MCP
automates via `cms_get_setup_status` / `cms_generate_onboarding_report`.

A newsroom deployment is launch-ready when all of the following hold:

1. **Site profile** — site name, public URL, logo, and theme configured.
2. **Navigations** — the required navigation slots exist: main, header, footer, footer-icons (missing navs break the Website Builder frontend).
3. **Domain & branding** — domain wired, favicon/branding assets present.
4. **Member plans** — at least one plan with a price and at least one available payment method attached. A plan without a payment method cannot be purchased.
5. **Payment setup** — payment methods configured and ≥1 active (Stripe / Payrexx / Mollie / Bexio, per the newsroom's choice). Provider secrets live in the deployment config, never in the KB.
6. **Subscription setup** — subscription settings consistent; system mails configured so members get confirmations.
7. **Communication** — mail provider connected (e.g. Mailchimp/Mailgun), system mail templates present, subscription-flow automation events mapped.
8. **Peering** (optional) — peer profile filled if the newsroom participates in article sharing.
9. **Legal** — privacy page (Datenschutz) published; consents configured if used.

Diagnostics path: the CMS MCP read tools check items 1–8 against the live tenant and return
`ready | blockers` with ordered next actions. The onboarding report is markdown, suitable for
pasting into a ticket or ingesting (reviewed) as a `setup_summary` chunk.

Each newsroom runs its **own deployment** (one API + Postgres per newsroom — there is no
multi-tenant API). "Which newsroom" always means "which configured deployment".
