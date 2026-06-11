# ee-news — We.Publish implementation profile

**Newsroom:** eenews (site title "ee-news.ch"; no custom_domain in repo — deploys under the `wepublish.cloud` production TLD per `deployment.config.json`)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/eenews/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
ee-news is the closest thing in this batch to a stock We.Publish deployment: a vanilla Website Builder app whose only customization is a typography-only theme (Hanken Grotesk across every variant, default palette untouched). There are no custom blocks, no block renderer override, no custom components of any kind — `src/` contains just the theme, feed/sitemap helpers and a logo. Its pages are byte-identical to siblings in several places (homepage matches ganzgraz exactly; article page matches website-example exactly), making it the useful "baseline tenant" reference when assessing how much any other newsroom diverged.

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json`. Full reference route set: homepage, `[slug]`, `a/[slug]` + id/tag variants, `author/*`, `event/*`, `search`, `login`, `signup`, `mitmachen`, `profile/index`, `profile/subscription/[id]`, `profile/subscription/deactivated`, plus the standard api routes. `src/` holds only `theme.tsx`, `feed.ts`, `sitemap.ts`, `logo.svg`. `pages/_app.tsx` is the template wiring: `WebsiteBuilderProvider` receives only `Head`, `Script`, `Link`, a German date formatter and `meta.siteTitle` — no `blocks`, no `blockStyles`, no component overrides. `next.config.js` is the standard template (API_URL/API_URL_INTERNAL, Sentry, bundle analyzer; no redirects, no extra env). `deployment.config.json` enables all three environments with empty env and declares `tdl` production `wepublish.cloud` / staging `wepublish.works`; no custom domain.

## Theming & design
`src/theme.tsx` extends `@wepublish/ui` and changes typography only: Hanken Grotesk (next/font/google, weights 100–700, italic + normal) applied to every variant (h1–h6, body, button, caption, overline, subtitles) and as the base `fontFamily`. No palette changes — colors are the upstream `@wepublish/ui` defaults. No component style overrides, no global styles.

## Custom blocks & content features
Not present. No block renderer override, no block styles, no custom teasers. `pages/a/[slug].tsx` is identical to `apps/website-example/pages/a/[slug].tsx` (tag-filtered related-articles list + comments gated on `disableComments`).

## Integrations
- **Monitoring:** Sentry via the shared `@wepublish/utils/sentry` wiring (`sentry.client.config.ts`, `instrumentation.ts`, `withSentryConfig`).
- Analytics, payment provider config (`thirdParty`), and mail/newsletter integrations: not present in app code or deployment config.

## Membership & paywall
Standard and complete: `withPaywallBypassToken` + `withSessionProvider`/`withJwtHandler` in `_app.tsx`; `mitmachen.tsx` renders CMS page slug `mitmachen` and delegates to `SubscribePage.getInitialProps` (identical file to ganzgraz); full self-service routes (`login`, `signup`, `profile/index`, `profile/subscription/[id]`, `profile/subscription/deactivated`). No custom Paywall component — default builder behaviour. No Stripe key wired in `thirdParty`, so payment provider selection is left to the backend/member plans.

## Peering
No custom peering UI; `PeerProfileDocument` is prefetched in page `getStaticProps` (homepage, slug pages, etc.) exactly as in the reference implementation.

## Notable routes & features
Standard api routes (rss/atom/json feeds, `sitemap`, `revalidate`, `health`). Homepage is ISR (60 s), rendering CMS page slug `""` full-width with link prefetch — the file is byte-identical to `apps/ganzgraz/pages/index.tsx`. Navbar/footer use the template category slugs (`[['categories','about-us']]`, footer slug `footer`). Nothing else diverges from `apps/website-example/`.

## Sources
- `apps/eenews/pages/_app.tsx`, `next.config.js`, `deployment.config.json`, `pages/index.tsx`, `pages/mitmachen.tsx`, `pages/a/[slug].tsx`
- `apps/eenews/src/theme.tsx`
- Diffs against `apps/website-example/pages/a/[slug].tsx` (identical) and `apps/ganzgraz/pages/index.tsx` (identical)
