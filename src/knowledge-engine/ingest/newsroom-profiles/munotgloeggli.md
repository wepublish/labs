# Munotglöggli — We.Publish implementation profile

**Newsroom:** munotgloeggli (https://munotgloeggli.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/munotgloeggli/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Munotglöggli (Schaffhausen) is the most vanilla implementation in this batch — its `pages/` tree is byte-identical to `apps/website-example/` except for `_app.tsx` and a minor `login.tsx` variant. The identity work happens in typography: licensed local fonts Sabon Next (serif, all headings and teaser titles) and TT Norms (everything else) over a red `#dc0d15` primary. The only component override is a one-purpose `BaseTeaser` wrapper that strips publication dates from page teasers, and analytics is Plausible rather than the Google stack used elsewhere.

## Stack & structure
Next.js (pages router) Nx app with the full standard route set (article/page/author/event/search/login/signup/profile + api feeds). `src/` contains just `theme.tsx`, `feed.ts`, `sitemap.ts`, `logo.svg`, and a single override at `src/components/website-builder-overwrites/blocks/teaser.tsx`. `next.config.js` is the stock template plus a `PA_ID` (Plausible) public runtime env var. `deployment.config.json` is the only one in this batch with a `tdl` block (production `wepublish.cloud`, staging `wepublish.works`). Verified by diff: only `_app.tsx` and `login.tsx` differ from website-example (login differs in SSR session-token handling details).

## Theming & design
`src/theme.tsx` loads two local font families via `next/font/local`: **Sabon Next LT Pro** (Regular/Italic/Bold/BoldItalic OTFs) for `h1`–`h5` and `teaserTitle`, and **TT Norms** (six cuts) for `h6`, body, buttons, captions, article authors, peer information, block/teaser/banner variants, and the global `fontFamily`. Palette: primary `#dc0d15` (red) via `augmentColor` over the `@wepublish/ui` base; no other palette changes. Layout shell (`Spacer`/`MainSpacer`/`NavBar`) matches the example.

## Custom blocks & content features
One override: `MunotgloeggliBaseTeaser` — for `PageTeaser`s with a page, it clones the teaser with `publishedAt: undefined` (both top-level and `latest`) before delegating to the stock `BaseTeaser`, so page teasers render without a date; article teasers pass through untouched. Registered via `blocks={{ BaseTeaser }}` in `_app.tsx`. No custom block renderer, block styles, or layout components.

## Integrations
- **Analytics:** Plausible via `next-plausible` (`PlausibleProvider` wrapping the whole app, enabled when `PA_ID` env var is set; script loaded from plausible.io with the site ID).
- **Monitoring:** Sentry (`sentry.client.config.ts`, `withSentryConfig`).
- No payment provider in `thirdParty`, no GTM/GA, no newsletter integration in app code.

## Membership & paywall
`pages/mitmachen.tsx` renders `PageContainer slug="mitmachen"` — the membership page is a CMS-managed page rather than a hardcoded `SubscribePage` (the subscribe UI therefore comes from the page's own blocks); `getInitialProps` prefetches the `mitmachen` page document and chains `SubscribePage.getInitialProps` for member-plan/session data. `locales/deOverriden.json` relabels the navbar subscribe button "Mitglied werden". Standard `withPaywallBypassToken`; no custom paywall logic. Full login/signup/profile self-service routes.

## Peering
Nothing beyond the builder baseline: standard `PeerProfileDocument` prefetch in page data fetching as in `website-example`. The theme does set the `peerInformation` typography variant to TT Norms, so peered-article attribution renders in the body font.

## Notable routes & features
Standard api routes (feeds, sitemap, revalidate, health). Custom favicon set (SVG + PNG variants) in `_app.tsx` head, diverging slightly from the example's favicon markup. German locale with the one-line locale override.

## Sources
- `apps/munotgloeggli/pages/_app.tsx`, `next.config.js`, `deployment.config.json`
- `apps/munotgloeggli/pages/mitmachen.tsx`
- `apps/munotgloeggli/src/theme.tsx`
- `apps/munotgloeggli/src/components/website-builder-overwrites/blocks/teaser.tsx`
- `apps/munotgloeggli/locales/deOverriden.json`
- diff vs `apps/website-example/pages/`
