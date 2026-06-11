# GanzGraz — We.Publish implementation profile

**Newsroom:** ganzgraz (https://ganzgraz.at)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/ganzgraz/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
GanzGraz (Graz, Austria — the only `.at` domain in the batch) is a near-stock We.Publish frontend distinguished almost entirely by its theme: League Spartan headings over Montserrat body text in a purple/lilac/orange palette (`#4E2996` / `#CDB9EE` / `#FF8900`), including a custom responsive `blockQuote` typography variant. Its single custom component is a one-rule navbar override that hides `NavbarActions` — i.e. the login/subscribe buttons are suppressed in the header even though the full membership route set (mitmachen, signup, profile, subscriptions) remains wired underneath. The `_app.tsx` site title is left at the default "We.Publish" rather than a brand name.

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json`. Full reference route set: homepage (byte-identical to eenews), `[slug]`, `a/*`, `author/*`, `event/*`, `search`, `login`, `signup`, `mitmachen`, `profile/index`, `profile/subscription/[id]`, `profile/subscription/deactivated`, standard api routes. `src/` contains only `components/gg-navbar.tsx`, `theme.tsx`, `feed.ts`, `sitemap.ts`, `logo.svg`. `pages/_app.tsx` is the template wiring plus `Navbar: GGNavbar`; no `blocks`, `blockStyles`, or other component overrides. `next.config.js` is the standard template (API_URL/API_URL_INTERNAL, Sentry, bundle analyzer; no redirects). `deployment.config.json` enables all environments, sets custom domain `https://ganzgraz.at`, and declares `tdl` production `wepublish.cloud` / staging `wepublish.works`; no env vars.

## Theming & design
`src/theme.tsx` extends `@wepublish/ui`: League Spartan (next/font/google) for h1–h6 and subtitles, Montserrat for body/button/caption/overline and the base font. Palette: primary `#4E2996` ("Dunkellila"), secondary `#CDB9EE` ("Flieder"), accent `#FF8900` (orange), explicit black/white commons. A custom `blockQuote` typography variant uses italic Montserrat with a `responsiveProperty` font-size ramp (values empty at this commit, so effectively just the family/style). No MUI component overrides. `GGNavbar` is `styled(Navbar)` with one rule: `NavbarActions { display: none }`.

## Custom blocks & content features
Not present. No block renderer override, no block styles, no custom teasers. `pages/a/[slug].tsx` is byte-identical to `apps/website-example/pages/a/[slug].tsx` (tag-filtered related-articles list + comments gated on `disableComments`).

## Integrations
- **Monitoring:** Sentry via shared `@wepublish/utils/sentry` wiring (`sentry.client.config.ts`, `instrumentation.ts`, `withSentryConfig`).
- Analytics, payment provider config (`thirdParty`), and mail/newsletter integrations: not present in app code or deployment config.

## Membership & paywall
Routes fully wired but de-emphasized in the UI: `withPaywallBypassToken` + session/JWT wrappers in `_app.tsx`; `mitmachen.tsx` renders CMS page slug `mitmachen` and delegates to `SubscribePage.getInitialProps` (byte-identical to eenews); `signup.tsx` is byte-identical to website-example; full profile/subscription self-service pages exist. However, the `GGNavbar` override hides the navbar's login/subscribe actions, so these flows are reachable only by direct URL or in-content links. No custom Paywall component, no Stripe key.

## Peering
No custom peering UI; `PeerProfileDocument` is prefetched in page `getStaticProps` as in the reference implementation.

## Notable routes & features
Standard api routes (rss/atom/json feeds, `sitemap`, `revalidate`, `health`). ISR homepage (60 s) rendering CMS page slug `""` full-width with link prefetch. Two small oddities worth knowing: the `<title>`/`meta.siteTitle` is the unchanged default "We.Publish", and the suppressed navbar actions make GanzGraz the "membership-hidden" counterpart to cultur's `loginBtn={null}` approach (different mechanism — CSS hide vs prop removal — same effect).

## Sources
- `apps/ganzgraz/pages/_app.tsx`, `next.config.js`, `deployment.config.json`, `pages/index.tsx`, `pages/mitmachen.tsx`, `pages/a/[slug].tsx`, `pages/signup.tsx`
- `apps/ganzgraz/src/theme.tsx`, `src/components/gg-navbar.tsx`
- Diffs against `apps/website-example/` and `apps/eenews/` (homepage, article page, mitmachen, signup identical)
