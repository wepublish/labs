# OnlineReports — We.Publish implementation profile

**Newsroom:** onlinereports (https://onlinereports.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/onlinereports/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
OnlineReports (Basel news portal) is the largest customization in this batch and the only Revive Adserver integration: a three-column layout with a sticky half-page ad rail, ads auto-injected after every third content block, an adblock-detection overlay, and an `AdsContext` that suppresses all ads on the subscribe page and on articles tagged `Anzeige`/`Publireportage`/etc. It overrides more builder components than any other batch-B app (Navbar, Footer, Article, Page, teaser/list/grid blocks, comments, registration, payment amount, rich-text rendering) and ships named editorial block styles — "RuckSpiegel", "Gelesen und Gedacht", "News", "Highlight", "AktuelleBild" — plus a defensive Next middleware that maps the legacy Typo3-era `*.html` URL space onto the new site or the `archiv2.onlinereports.ch` archive.

## Stack & structure
Next.js (pages router) Nx app, standard route set plus `middleware.ts` + `redirectMap.ts` (236 lines). `src/` is extensive: `onlinereports-*` block/teaser/grid/list overrides and global styles, `structure.tsx` (4-column CSS grid: 994px content + sticky 320px ad column), `navigation/` (custom navbar/app-bar/nav-paper), `components/` (article, page, footer, advertisement, revive-ad, adblock-detector, blue-box, author chips/authors/list, comment-list-item, payment-amount + currency spinner, quote-block), `block-styles/` + `custom-teasers/` (5 named styles), `context/ads-context.tsx`, `forms/registration-form.tsx`.

## Theming & design
`src/theme.tsx`: Google fonts Inter (300–700, workhorse) and Lora (600 italic, serif accents); palette primary red `#E1190F`, secondary light blue `#89B9DC` with dark-blue contrast text `#10243A`, custom text colors. `_app.tsx` restyles `TitleBlock` (44px desktop titles, hidden pretitle wrapper) and replaces the example's `Container` shell with the bespoke `Structure` grid; footer hides the We.Publish logo (`wepublishLogo="hidden"`) but links wepublish.ch in its own markup. Extensive `deOverridden.json` locale file rewrites teaser bylines, image captions, and the whole subscription wording toward donations ("Ich unterstütze {siteTitle}…").

## Custom blocks & content features
`OnlineReportsBlockRenderer` dispatches block styles **Highlight** (grid/list/slots), **News**, **RuckSpiegel**, **Gelesen und Gedacht** (curated link teasers inside a "BlueBox"), and **AktuelleBild** (image teaser slider); on non-page documents it then auto-appends an ad after every 3rd block (a half-page unit at position 6). Custom teaser components per style live in `custom-teasers/`. `OnlineReportsArticle` disables ads for articles tagged `Anzeige`, `Publireportage`, `Monatsgespräch`, `NB`, `No Banner` and adds a scroll-to-comments affordance; custom comment list items, author chips, and article-author rendering round out the editorial surface.

## Integrations
- **Ads:** Revive Adserver — async script from `servedby.revive-adserver.net`, `ReviveAd` renders `<ins data-revive-zoneid>` tags (wideboard/half-page/small zones), re-randomized on route change; wideboard above content, sticky half-page in the right rail (hidden under 1200px).
- **Adblock detection:** `AdblockOverlay` checks for unfilled Revive `<ins>` elements and shows a full-width dismissable overlay (dismissal persisted in localStorage).
- **Analytics:** GTM (`GTM_ID` env var). **Monitoring:** Sentry.

## Membership & paywall
No paywall — the model is voluntary support. `pages/mitmachen.tsx` heavily restyles `SubscribePage` via grid-template-areas, hides the transaction-fee icon, and disables ads while mounted. `OnlineReportsPaymentAmount` replaces the amount picker with a `CurrencyNumberSpinner` (base-ui NumberField); `OnlineReportsRegistrationForm` adds a checkbox/flow that forwards name+email into `/mitmachen` query params. Full login/signup/profile routes present.

## Peering
Nothing beyond the builder baseline: standard `PeerProfileDocument` prefetch in page data fetching, as in `website-example`; no custom peer UI.

## Notable routes & features
`middleware.ts` (matcher `/(.*html)`) handles the legacy archive: path-traversal/SSRF-hardened normalization, exact `redirectMap` hits 301 to new tag/article URLs, otherwise it probes `https://archiv2.onlinereports.ch<path>` (10s timeout) and 302s there when the archive has real content. Standard api routes (feeds, sitemap, revalidate, health).

## Sources
- `apps/onlinereports/pages/_app.tsx`, `middleware.ts`, `redirectMap.ts`, `next.config.js`, `deployment.config.json`
- `apps/onlinereports/pages/mitmachen.tsx`
- `apps/onlinereports/src/{theme,structure,onlinereports-block-renderer}.tsx`
- `apps/onlinereports/src/components/`, `src/block-styles/`, `src/custom-teasers/`, `src/context/ads-context.tsx`, `locales/deOverridden.json`
