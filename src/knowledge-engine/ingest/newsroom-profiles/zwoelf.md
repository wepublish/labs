# Zwölf — We.Publish implementation profile

**Newsroom:** zwoelf (https://www.zwoelf.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/zwoelf/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Zwölf (Swiss football magazine) is a light-touch implementation whose defining decision is that commerce lives off-platform: there is no `mitmachen` or `signup` page at all — the navbar's subscribe button links out to `shop.zwoelf.ch`, and a Next middleware 307-redirects `/mitmachen` to the same external shop. On-site customization is limited to a pale-green Hanken Grotesk theme, a `BaseTeaser` that hides timestamps, a recolored FocusTeaser block style, and a login flow that lands users on a CMS-managed `/after-login` page instead of `/profile`.

## Stack & structure
Next.js (pages router) Nx app. Route set matches `website-example` minus `mitmachen.tsx` and `signup.tsx`; `login.tsx`, `profile/*` (incl. subscription detail/deactivated) and all content routes are present. `src/` contains only `theme.tsx`, `zwoelf-base-teaser.tsx`, `zwoelf-focus-teaser.tsx`, `feed.ts`, `sitemap.ts`, `logo.svg`. Extra root files: `middleware.ts` + `redirects.json` (a single entry: `/mitmachen` → `https://shop.zwoelf.ch/produkt-kategorie/abos/`, served as 307). `next.config.js` is stock plus `GA_ID`. Verified by diff: `[slug].tsx` differs from the example only in a fixed `revalidate: 60`.

## Theming & design
`src/theme.tsx`: Google font **Hanken Grotesk** (100–700, normal + italic) across all typography variants; palette primary pale green `#B2D7AF` with white contrast text, secondary black, and `blockTitlePreTitle.backgroundColor` set to the same green so title pretitles render as green chips. `_app.tsx` keeps the stock layout shell; the navbar uses category slugs `[['about']]` and — unusually — `FooterContainer` reuses the `main` navigation slug rather than a dedicated `footer` one.

## Custom blocks & content features
Two small overrides registered in `WebsiteBuilderProvider`: `blocks.BaseTeaser: ZwoelfBaseTeaser` — a styled stock teaser whose only change is `${TeaserTime} { display: none }` (no timestamps on teasers, fitting a magazine cadence) — and `blockStyles.FocusTeaser: ZwoelfFocusTeaser`, which recolors the focus teaser (black content panel, green title band, larger mobile padding). No custom block renderer, no custom teasers, no layout components.

## Integrations
- **Analytics:** Google Analytics (`GA_ID` env var) via `@next/third-parties`, set for production and staging in deployment config.
- **Commerce:** external WooCommerce-style shop at `shop.zwoelf.ch` (subscription products), linked from the navbar `subscribeBtn` (target `_blank`) and the `/mitmachen` middleware redirect. Not part of this app's code beyond the links.
- **Monitoring:** Sentry. No GTM, no payment provider in `thirdParty`, no newsletter integration.

## Membership & paywall
No on-site checkout: member acquisition is delegated to the external shop (see above), so the shared `SubscribePage` is unused and absent. Login and `profile/*` self-service routes remain for existing members (the We.Publish user/subscription backend is still the system of record for access). `pages/login.tsx` redirects authenticated users to `/after-login` (a CMS page slug) rather than `/profile`. Standard `withPaywallBypassToken` wrapper; no paywall logic in app code. Locale override: navbar subscribe = "Abo lösen".

## Peering
Nothing beyond the builder baseline: standard `PeerProfileDocument` prefetch in page data fetching, as in `website-example`; no custom peer UI.

## Notable routes & features
`middleware.ts` performs O(1) Map lookups over `redirects.json` and issues 307s to absolute destinations (currently only the shop redirect). Standard api routes (feeds, sitemap, revalidate, health). German locale with one-line override file.

## Sources
- `apps/zwoelf/pages/_app.tsx`, `middleware.ts`, `redirects.json`, `next.config.js`, `deployment.config.json`
- `apps/zwoelf/pages/login.tsx`, `pages/[slug].tsx`
- `apps/zwoelf/src/{theme,zwoelf-base-teaser,zwoelf-focus-teaser}.tsx`
- `apps/zwoelf/locales/deOverriden.json`
- diff vs `apps/website-example/pages/`
