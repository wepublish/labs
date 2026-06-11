# Gruppetto — We.Publish implementation profile

**Newsroom:** gruppetto (https://gruppetto-magazin.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/gruppetto/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Gruppetto ("Das neue Schweizer Radsportmagazin", a Swiss cycling magazine) is one of the lightest customizations in the fleet: a near-stock Website Builder frontend whose identity comes almost entirely from theming — a pink palette, a full-page repeating background SVG, and a transparent footer — plus a single custom block (a CTA-styled Break block). Its membership page is print-magazine-shaped: a `SubscribePage` defaulting to the `gruppetto` member plan with a `?tag` query parameter that switches the visible plan set, and locale overrides that relabel subscription as "Abo lösen" with "Ab {yearlyPrice} pro Jahr" pricing copy.

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json` — dependencies from the monorepo root. Full standard route set from `apps/website-example/` (article/page/author/event/search/login/signup/profile + api feeds). `src/` contains only `footer.tsx`, `break-block.tsx`, `background.svg`, `logo.svg`, `feed.ts`, `sitemap.ts` — no component tree. The theme is defined inline in `pages/_app.tsx` rather than in a `src/theme.tsx`. `next.config.js` adds a `/abo` → `/mitmachen` redirect on top of the shared We.Publish redirects.

## Theming & design
Theme is created inline in `_app.tsx` via `createTheme` over the `@wepublish/ui` base: primary `#F084AD` (pink, dark `#BC4D77`), default background `#FFFAFC`, border radius 3. The page `Spacer` carries `src/background.svg` as a repeating full-cover background. The navbar hides all but the first two `NavbarLink`s via CSS (`:nth-child(n+3) { display: none }`); navbar categories are `['account', 'issues', 'about-us']` (issue-based navigation, fitting a magazine). `src/footer.tsx` overrides the builder Footer to be background-transparent with body text color.

## Custom blocks & content features
One custom block: `GruppettoBreakBlock` (`src/break-block.tsx`), registered via `blocks={{ Break }}` in `WebsiteBuilderProvider`. When the break block has a button it renders `CTABreakBlock` — primary-pink background, generous padding, two-column layout above `md`; with `hideButton` it falls back to the stock `BreakBlock`. No custom block renderer, teasers, or block styles. Homepage renders CMS page slug `''` via `PageContainer` (without the example's `ContentWidthProvider fullWidth`); article page adds a related-articles list (tag-filtered, 3 items) and a comment list, matching the standard pattern.

## Integrations
- **Analytics:** Google Analytics (`GA_ID` env var) and Google Tag Manager (`GTM_ID` env var) via `@next/third-parties`, both set in `deployment.config.json` for production.
- **Monitoring:** Sentry (`sentry.client.config.ts`, `withSentryConfig` in `next.config.js`).
- No payment provider wired in `thirdParty`, no mail/newsletter integration present.

## Membership & paywall
`pages/mitmachen.tsx` renders `SubscribePage` with `defaults.memberPlanSlug: 'gruppetto'`; member plans are filtered by the `?tag` router query — without a tag only untagged plans show, with a tag only plans carrying that tag. `locales/deOverriden.json` overrides `navbar.subscribe` to "Abo lösen" and the member-plan price string to "Gratis / Ab {yearlyPrice} pro Jahr". Standard `withPaywallBypassToken` wrapper; no custom Paywall component — no paywall gating logic in the app code. Full `login`/`signup`/`profile/*` self-service routes present.

## Peering
Nothing beyond the builder baseline: `PeerProfileDocument` is prefetched in page `getStaticProps`/`getInitialProps` exactly as in `website-example`; no custom peer components or peered-content UI.

## Notable routes & features
Standard api routes (`rss/atom/json-feed`, `sitemap`, `revalidate`, `health`). `/abo` redirects to `/mitmachen` (next.config). German locale via date-fns + translator with the small `deOverriden.json` override file.

## Sources
- `apps/gruppetto/pages/_app.tsx` (inline theme, background, navbar CSS), `next.config.js`, `deployment.config.json`
- `apps/gruppetto/pages/{index,mitmachen}.tsx`, `pages/a/[slug].tsx`
- `apps/gruppetto/src/{break-block,footer}.tsx`
- `apps/gruppetto/locales/deOverriden.json`
