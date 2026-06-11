# Mannschaft — We.Publish implementation profile

**Newsroom:** mannschaft (https://mannschaft.com)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/mannschaft/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Mannschaft, the German-language LGBTIQ magazine, is the most ads-and-paywall-driven implementation in this batch. It overrides nearly the whole block pipeline (Page, Article, Blocks, Renderer, BaseTeaser, TeaserGrid, Break, RichText), monetizes via Google Ad Manager slots encoded as CustomTeasers with `ad-<size>` preTitles — auto-inserted after the 3rd and 6th rich-text block of every article plus fixed slots around the article body — and gates articles tagged `MANNSCHAFT+` behind a client-side CSS paywall. It also ships OneSignal web push, a consentmanager "pay or accept" (PUR) stub, country-dependent CHF/EUR member plans, and a 46k-line legacy redirect map served from Next middleware.

## Stack & structure
Next.js (pages router) Nx app; standard route skeleton plus `middleware.ts` + `redirects.json` (legacy URL map, ~46k lines, O(1) Map lookup, 301s). `src/` is flat: `mannschaft-*.tsx` overrides (article, page, blocks, block-renderer, teaser, base-teaser, teaser-grid, focus-teaser, break-block, richtext-block, content-box, global-styles, article-date-with-share), `block-styles/` + `custom-teasers/` (ad, highlight, hot-and-trending), `paywall/paywall-block.tsx`, `cookie-or-pay/pur-model.tsx`, `theme.tsx`. `_app.tsx` wires these into `WebsiteBuilderProvider` and hardcodes navbar children: search plus Facebook/Instagram/Bluesky/TikTok icon links.

## Theming & design
`src/theme.tsx`: local "Plain" font (Light/Italic/Medium OTFs) across every typography variant; palette primary black (`#000`), secondary pink `#E94090`, accent cyan `#00AEC2` with yellow light `#FFEE00`, plus full error/warning/info/success overrides. `MannschaftGlobalStyles` adds hyphenation limits globally. Break blocks come in many editor-selectable color variants (`mannschaft-break-block.tsx` exports primary/secondary/accent/light-accent/violet/purple/info/error/success/warning predicates consumed by the block renderer).

## Custom blocks & content features
`MannschaftBlockRenderer` (ramda `cond`) dispatches block styles: **HotAndTrending**, **Ad teaser rows** (`1st/2nd/3rd Teaser Ad` styles on TeaserList blocks, ad slot at position 0/1/2), **Highlight**, and **ContentBox**, plus seamless-background CSS stitching between break/slider/focus blocks. `MannschaftBlocks` injects a 300x250 ad CustomTeaser after the 3rd and 6th rich-text blocks of articles (never pages); `MannschaftArticle` wraps every article with an ad slot before and after the body. `MannschaftArticleDateWithShare` replaces the article date with a date+share row; `FocusTeaser` block style restyled.

## Integrations
- **Ads:** Google Ad Manager via `react-ad-manager` — `AdConfig` in `<Head>`, GPT script (`securepubads.g.doubleclick.net/tag/js/gpt.js`) lazy-loaded; `custom-teasers/ad.tsx` maps CustomTeaser preTitles (`ad-970x250`, `ad-728x90`, `ad-320x480`, `ad-320x416`, `ad-300x600`, `ad-300x250`) to sized slots, desktop-only for large formats.
- **Push:** OneSignal web push initialized client-side in `_app.tsx` (`react-onesignal`, notify button enabled).
- **Consent:** `cookie-or-pay/pur-model.tsx` implements the consentmanager PUR ("pay or accept") hooks — sets `cmp_pur_loggedin` from `useHasActiveSubscription()`; PUR mode currently disabled in code (`cmp_pur_enable = false`). Rendered only when GTM is active.
- **Analytics:** GTM (`GTM_ID` env var). **Monitoring:** Sentry.

## Membership & paywall
Tag-driven paywall in `pages/a/[slug].tsx`: if the visitor has no active subscription, the article carries tag `MANNSCHAFT+`, and no matching `articleId` query param is present, a CSS mask hides all blocks after the third and fades the third, and the custom `PaywallBlock` ("Unterstütze LGBTIQ-Journalismus", Abonnent*in werden / Login buttons) renders inside the article. `pages/mitmachen.tsx` filters member plans by currency based on `useUserCountry()` — CHF for Switzerland, EUR otherwise — with fields firstName, address, birthday, password. Full login/signup/profile routes. No Stripe key in `thirdParty` (payment handled by the API-side providers; not present in frontend config).

## Peering
Nothing beyond the builder baseline: standard `PeerProfileDocument` prefetch in page data fetching, as in `website-example`; no custom peer UI.

## Notable routes & features
`middleware.ts` 301-redirects legacy WordPress-era paths (numeric IDs and old slugs) to `/a/<slug>` from `redirects.json`. Article page appends a tag-filtered "Das könnte dich auch interessieren" list and comments. Standard api routes (feeds, sitemap, revalidate, health).

## Sources
- `apps/mannschaft/pages/_app.tsx`, `middleware.ts`, `redirects.json`, `next.config.js`, `deployment.config.json`
- `apps/mannschaft/pages/mitmachen.tsx`, `pages/a/[slug].tsx`
- `apps/mannschaft/src/{theme,mannschaft-block-renderer,mannschaft-blocks,mannschaft-article}.tsx`
- `apps/mannschaft/src/{paywall,cookie-or-pay,custom-teasers,block-styles}/`
