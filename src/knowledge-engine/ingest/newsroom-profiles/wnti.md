# WNTI — We.Publish implementation profile

**Newsroom:** wnti (https://wnti.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/wnti/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
WNTI is visibly a Tsri derivative: every one of its custom components is named `Tsri*` (`TsriNavbar`, `TsriTeaser`, `TsriBreakBlock`, `TsriQuoteBlock`, `TsriRichText`, `TsriContextBox`, `TsriArticleMeta`, `TsriAdHeader`), reusing tsri.ch's component layer under a new brand — local Faro display font, Signifier italic serif for emphasis and quotes, near-black/rose palette. Its two distinctive patterns are an author-as-advertiser sponsored-content header (authors tagged `sponsor`/`promo` render as an advertiser banner above the article) and a membership flow whose `SubscribePage` configuration is registered globally as the builder's `Subscribe` block, so CMS editors can drop the subscribe form into any page.

## Stack & structure
Next.js (pages router) Nx app. Standard route set minus `signup.tsx` (no standalone signup page; registration happens via the subscribe flow). `src/` holds `theme.tsx`, `components/tsri-*.tsx` (7 components), bundled woff2 fonts (`FaroWeb-DisplayLucky`, `FaroWeb-SemiBoldLucky`, `SignifierMedium-Italic`), and the standard `feed.ts`/`sitemap.ts`. `next.config.js` exposes `GA_ID`, `SPARKLOOP_ID`, `STRIPE_PUBLIC_KEY`, `GTM_ID` (public) and `MAILCHIMP_API_KEY`/`MAILCHIMP_SERVER_PREFIX` (server). Homepage and CMS pages wrap `PageContainer` in `ContentWidthProvider fullWidth={false}` — a constrained-width layout, opposite of the example's full-width home.

## Theming & design
`src/theme.tsx`: **Faro** (800 display for h1–h4, 600 elsewhere) as the universal font, **Signifier Medium Italic** force-applied (with `!important`) to `em`/`i`, blockquotes, and `MuiQuoteBlock` paragraphs — a deliberate serif-italic voice inside sans-serif text. Palette: primary near-black `#232524` with rose light `#F2BDB8`, secondary/accent `#FFEDEB`; `MuiButton` overrides render contained buttons rose-on-black. `TsriNavbar` constrains the navbar inner wrapper to the `lg` breakpoint and hides icon buttons; `TsriTitle` (defined in `_app.tsx`) shrinks mobile title sizes.

## Custom blocks & content features
Registered in `WebsiteBuilderProvider`: `BaseTeaser: TsriTeaser` (neutralizes pretitle background and image hover zoom), `Break: TsriBreakBlock` (accent background, secondary-colored button), `Quote: TsriQuoteBlock`, `RichText: TsriRichText`, `Title: TsriTitle`, `Subscribe: MitmachenInner`, `blockStyles.ContextBox: TsriContextBox` (icon hidden, thin line), `ArticleMeta: TsriArticleMeta` (tag row plus a comment-count badge linking to `#comments`), and `PaymentAmount: PaymentAmountPicker` from the membership lib. `pages/a/[slug].tsx` adds `TsriAdHeader` above the article — authors tagged `sponsor` or `promo` render as an advertiser banner (logo + rich-text bio linking to the author's first URL) — and renders `ArticleAuthor` boxes inside the article body.

## Integrations
- **Payment:** Stripe via `thirdParty.stripe` (`STRIPE_PUBLIC_KEY` env var).
- **Analytics:** GTM (`GTM_ID`); `GA_ID` is wired in next.config but empty in deployment config and no `GoogleAnalytics` component is rendered.
- **Referral:** SparkLoop script loaded when `SPARKLOOP_ID` is set.
- **Mail:** Mailchimp env vars (`MAILCHIMP_API_KEY` secret, `MAILCHIMP_SERVER_PREFIX`) are declared in next.config and deployment config, but no app code references them — apparently provisioned without a consuming api route at this commit.
- **Monitoring:** Sentry.

## Membership & paywall
`pages/mitmachen.tsx` exports `MitmachenInner` — `SubscribePage` with field `firstName`, plans filtered to tag `selling`, default plan `mitgliedschaft` — and the page itself embeds it inside CMS page slug `mitmachen` (styled `PageContainer` with grid placement for the subscribe wrapper). Because `MitmachenInner` is also the global `Subscribe` block, any CMS page can host the same flow. `getInitialProps` prefetches page, member plans, navigation, peer profile, and (when logged in) `Me` + invoices. Standard `withPaywallBypassToken`; no custom paywall. Locale override: navbar subscribe = "Mitglied werden". Login/profile routes present; no signup page.

## Peering
Nothing beyond the builder baseline: `PeerProfileDocument` prefetch in page data fetching (including mitmachen), as in `website-example`; no custom peer UI.

## Notable routes & features
Standard api routes (feeds, sitemap, revalidate, health). No middleware or redirect maps. German locale with one-line override file.

## Sources
- `apps/wnti/pages/_app.tsx`, `next.config.js`, `deployment.config.json`
- `apps/wnti/pages/{mitmachen,index}.tsx`, `pages/a/[slug].tsx`, `pages/[slug].tsx`
- `apps/wnti/src/theme.tsx`
- `apps/wnti/src/components/{tsri-ad-header,tsri-teaser,tsri-navbar,tsri-break-block,tsri-context-box,tsri-article-meta}.tsx`
- `apps/wnti/locales/deOverriden.json`
