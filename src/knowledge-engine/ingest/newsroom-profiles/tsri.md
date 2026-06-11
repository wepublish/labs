# Tsri — We.Publish implementation profile

**Newsroom:** tsri (https://tsri.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/tsri/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Tsüri.ch is a Zurich city-media outlet whose app is the most extensively component-overridden of the pilot batch: it replaces not just blocks but the Navbar, Footer, Article, Author pages, comment list, rich text and tags with `Tsri*` components. Its signature is a TeaserSlots-based layout system (`TsriLayoutType` enum) mapping editor-chosen layout names to sidebar/hero/archive teaser arrangements. It is also the only pilot app doing server-side Mailchimp API calls (newsletter campaigns into the homepage sidebar) and the only one with native ad tooling (Bildwurf ad block, sponsored-article header).

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json` (deps from monorepo root). Route skeleton matches `apps/website-example/` minus `signup.tsx`; adds `locales/deOverriden.json` passed to `initWePublishTranslator()`. `src/components/` is organized by concern: `teaser-layouts/` (layout dispatchers), `teasers/` (16 teaser renderers), `block-layouts/`, `break-blocks/`, `newsletter/`, `tabbed-content/`, plus ~25 `tsri-*` top-level overrides. `next.config.js` adds legacy redirects (`/zh/rubrik/:slug`, `/redaktion`, `/agenda`, campaign short links) and server-side Mailchimp env plumbing.

## Theming & design
`src/theme.tsx`: Hanken Grotesk (next/font/google) on the We.Publish base theme; palette is TSRI Blue `#0c9eed`, TSRI Yellow `#f5ff64` (hover highlight everywhere), TSRI Grey `#aeb3be`. Heavy use of container-query units (`cqw`) and a `--sizing-factor` CSS variable for fluid teaser typography. Exports ~10 scoped sub-themes (`sidebarDailyBriefingTheme`, `sidebarEventsTheme`, `sidebarShopProductsTheme`, `sidebarTsriLoveTheme`, `teaserTwoRowTheme`, `teaserHeroTheme`, …) plus custom MUI `Link` variants (`navbarTab`, `categoryLink`, `dailyBriefingLink`) and a `navbarInnerWrapper` Toolbar variant (`mui-augmentations.d.ts`). `tsri-v2-navbar.tsx` is a full custom AppBar, subscription-aware via `useHasActiveSubscription`; `tsri-global-styles.tsx` adds global CSS.

## Custom blocks & content features
`src/components/tsri-block-renderer.tsx` dispatches block styles TabbedContent, TsriSidebarContent, TsriSidebarContentAltColor, passing sibling-block metadata into renderers. The core system is `teaser-layouts/tsri-layout.tsx`: a `TsriLayoutType` enum (`T_FullsizeImage`, `T_NoImage`, `T_TwoCol`, `T_XLFullsizeImage`, `ArchiveTopic*`, `SB_DailyBriefing`, `SB_ShopProducts`, `SB_Events`, `SB_TsriLove`, `HeroTeaser`) routed through `tsri-base-teaser-slots.tsx` to layout files (`layout-hero-teaser.tsx`, `layout-sidebar-daily-briefing.tsx`, `hero-teaser-with-tabbed-sidebar-content.tsx`, …) and teaser renderers in `teasers/`. Overridden builder slots include `Article`, `ArticleList`, `Author*`, `CommentList`, `RichText`, `Tag`, `Title`, `Quote`, `Break`, `FlexBlock`, `ImageSlider`/`ContextBox` block styles, and `TsriBanner`. `tsri-ad-header.tsx` renders an advertiser header on sponsored articles based on author tags `sponsor`/`promo`.

## Integrations
- **Payment:** Stripe via `thirdParty.stripe` (`STRIPE_PUBLIC_KEY` env var).
- **Analytics:** Google Analytics (`GA_ID`), Google Tag Manager (`GTM_ID`), SparkLoop referral script (`SPARKLOOP_ID`).
- **Mail/newsletter:** Mailchimp server-side — `pages/index.tsx` `getStaticProps` calls `mailchimp.campaigns.list()` (env vars `MAILCHIMP_API_KEY` (secret), `MAILCHIMP_SERVER_PREFIX`) and feeds sent campaigns into `DailyBriefingContext` for the homepage sidebar; `newsletter/mailchimp-form.tsx` is a react-hook-form/zod signup form that also embeds a Typeform widget.
- **Ads:** Bildwurf via styled `BildwurfAdBlock` (`tsri-bildwurf-ad-block.tsx`).
- **Monitoring:** Sentry (client config + `withSentryConfig`).

## Membership & paywall
`pages/mitmachen.tsx` renders `SubscribePage` (field `firstName`, member plans filtered to tag `selling`) inside `PageContainer` slug `mitmachen`, with styled grid overrides. `_app.tsx` registers `PaymentAmountPicker` as the `PaymentAmount` slot. Paywall is the standard `withPaywallBypassToken` wrapper — no custom Paywall component. The custom navbar surfaces subscription state (`useHasActiveSubscription`).

## Peering
Consumes peer metadata at teaser level: `teasers/tsri-teaser.tsx` renders a `TeaserPeerLogo` via `selectTeaserPeerImage` on peered teasers. `PeerProfileDocument` is prefetched in `getStaticProps` (e.g. `pages/index.tsx`). No dedicated peered-content block like Bajour's.

## Notable routes & features
Standard api routes (feeds, `sitemap`, `revalidate`, `health`) — Mailchimp calls happen in page SSG, not an api route. Homepage is ISR (revalidate 60s) combining the CMS `home` page with live newsletter-campaign links. `hooks/page-type-based-content.tsx` powers page-type-aware navbar content (article preTitle, tag, event name, search phrase).

## Sources
- `apps/tsri/pages/_app.tsx`, `next.config.js`, `deployment.config.json`, `pages/{index,mitmachen}.tsx`
- `apps/tsri/src/theme.tsx`, `src/hooks/page-type-based-content.tsx`
- `apps/tsri/src/components/tsri-block-renderer.tsx`, `teaser-layouts/tsri-layout.tsx`, `tsri-ad-header.tsx`
- `apps/tsri/src/components/{teasers,teaser-layouts,break-blocks,newsletter}/`
