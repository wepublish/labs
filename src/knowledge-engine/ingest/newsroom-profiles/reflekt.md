# Reflekt — We.Publish implementation profile

**Newsroom:** reflekt (https://reflekt.wepublish.cloud)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/reflekt/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Reflekt (the Swiss investigative newsroom REFLEKT) is, by code volume, the most minimal app in the entire batch — effectively `website-example` with a font swap. Its only deliberate customization is a theme that sets Hanken Grotesk across every typography variant; there are no palette changes, no custom blocks, no component overrides, no analytics or payment wiring, and its "custom domain" in deployment config is still a `wepublish.cloud` subdomain. It is the clearest example of what a zero-effort We.Publish tenant looks like.

## Stack & structure
Next.js (pages router) Nx app with the full standard route set (article/page/author/event/search/login/signup/profile + api feeds). `src/` contains only `theme.tsx`, `feed.ts`, `sitemap.ts`, `logo.svg`. `next.config.js` is the stock template with no extra env vars beyond `API_URL`/`API_URL_INTERNAL` and no custom redirects. Diff against `website-example` shows only minor drift: a removed blank line in `[slug].tsx`, an older pagination variant in `a/index.tsx` (Pagination component instead of the example's canonical-URL/Head version), small api-route/feed differences, and `mitmachen.tsx`. One structural difference in `_app.tsx`: the HOC chain omits `withBuilderRouter` (present in website-example and the other batch-B apps).

## Theming & design
`src/theme.tsx` extends the `@wepublish/ui` base theme with Google font **Hanken Grotesk** (weights 100–700, normal + italic) applied to h1–h6, body, button, caption, overline, subtitles, and the global `fontFamily`. No palette, shape, breakpoint, or component overrides. The `_app.tsx` layout shell (`Spacer`, `MainSpacer maxWidth="lg"`, styled `NavbarContainer`, `FooterContainer` with `categories`/`about-us` slugs) matches website-example verbatim.

## Custom blocks & content features
None. No `blocks`, `blockStyles`, or component props are passed to `WebsiteBuilderProvider` beyond the standard `Head`, `Script`, `elements.Link`, date formatter, and site title ("We.Publish" — the default site title string was not even changed in code; page titles come from CMS content).

## Integrations
- **Monitoring:** Sentry (`sentry.client.config.ts`, `withSentryConfig` in `next.config.js`).
- No analytics (no GA/GTM/Plausible), no payment provider in `thirdParty`, no newsletter or push integration. `deployment.config.json` production env is empty (`{}`), with no secret env vars.

## Membership & paywall
`pages/mitmachen.tsx` is two lines: it re-exports the shared `SubscribePage` unmodified (no member-plan filter, no field config, no defaults). Standard `withPaywallBypassToken` wrapper; no paywall logic in app code. Full login/signup/profile self-service routes present.

## Peering
Nothing beyond the builder baseline: standard `PeerProfileDocument` prefetch in page data fetching, identical to `website-example`; no custom peer UI.

## Notable routes & features
Standard api routes (feeds, sitemap, revalidate, health). No middleware, no redirects, no locale overrides (no `locales/` directory). Production deploys to `https://reflekt.wepublish.cloud` rather than a first-party domain.

## Sources
- `apps/reflekt/pages/_app.tsx`, `next.config.js`, `deployment.config.json`
- `apps/reflekt/pages/mitmachen.tsx`
- `apps/reflekt/src/theme.tsx`
- diff vs `apps/website-example/pages/`
