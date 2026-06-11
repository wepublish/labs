# Hauptstadt — We.Publish implementation profile

**Newsroom:** hauptstadt (https://www.hauptstadt.be)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/hauptstadt/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
"Hauptstadt" is a reader-financed Bern online newspaper (with an annual print magazine) and the membership/paywall reference of the pilot batch: a custom paywall with in-place upgrade offers, a duplicated mid-article paywall, premium-plan indicators on titles, a fully overridden subscribe/member-plan/payment-method flow, and an httpOnly-cookie auth session unique among the pilots. Design-wise it is a classic newspaper look using two local font families (Tiempos serif for content, ABC Whyte sans for UI), reader-adjustable font size, and dedicated print stylesheets.

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json` (deps from monorepo root). Route skeleton matches `apps/website-example/` plus `pages/api/cookie.ts` (session cookie endpoint) and `locales/deOverriden.json`. `src/components/` holds ~24 `hauptstadt-*` overrides, plus `src/hooks/` (`inform-user-upgrade.ts`, `use-is-first-route.tsx`, `use-redirect-to-landing.tsx`), `src/print-styles.tsx` and `src/block-style/centter-text.tsx` (sic — "Center Text" block-style predicate). `next.config.js` carries an exceptionally large redirect map: legacy `/article/:slug`→`/a/:slug`, `/abo`→`/mitmachen`, dozens of tag shortcuts, and `/l/*` short links for the 2022–2024 print magazines.

## Theming & design
`src/theme.tsx` loads two local font families via `next/font/local`: **Tiempos Text** and **ABC Whyte** (`public/fonts/`). Palette is muted newspaper pastel: primary `#abd8da`, secondary `#272727`, accent `#f3ded0`; adds a custom `xxl` breakpoint (2116px) and per-breakpoint `containerMaxWidth`. Exports layered sub-themes (`contentTheme` serif article body, `pageTheme`, `alternatingTeaserTheme`, `breakBlockTheme`) and custom typography variants incl. `peerInformation`. `components/font-size-picker.tsx` gives readers a localStorage-persisted base-font-size slider via MUI `GlobalStyles`. `src/print-styles.tsx` + `components/print-logo.tsx` hide navbar, banners, comments, appendix teasers and paywall on `@media print`.

## Custom blocks & content features
Registered in `_app.tsx`: `HauptstadtBlockRenderer`, `Title` (with premium indicator), `Quote`, `Image`/`ImageGallery`, `Break`, `Listicle` (counter hidden, image-first), `Subscribe` block, `BaseTeaser`/`TeaserList`/`TeaserGrid`/`TeaserSlots` (`hauptstadt-teaser.tsx`) plus block styles `FocusTeaser`, `AlternatingTeaser`, `TeaserSlider`. Builder-level overrides go beyond blocks: `Navbar`, `Footer`, `ContentWrapper`, `Page`, `Article`, `ArticleAuthors`/`Meta`/`Date`, `AuthorChip`, `Event`, `Banner`, `CommentList`. `hauptstadt-premium-indicator.tsx` shows a premium chip on the title when the article's paywall references a member plan tagged `premium`.

## Integrations
- **Payment:** no Stripe key in `next.config.js`; payment UI is customized via `hauptstadt-payment-method-picker.tsx` over the shared membership lib (provider selection driven by API-side member plans — not visible in app code).
- **Analytics:** Google Tag Manager only (`GTM_ID` env var).
- **Mail/newsletter:** no app-side newsletter integration present.
- **Monitoring:** Sentry (client config + `withSentryConfig`).

## Membership & paywall
The headline feature. `hauptstadt-paywall.tsx` wraps the shared `Paywall` with upgrade logic: it inspects active subscriptions (`isSubscriptionUpgradeable` in `hooks/inform-user-upgrade.ts`) and, when an upgrade is possible, rewrites the subscribe URL to `/mitmachen?upgradeSubscriptionId=…` and swaps CTA text ("Jetzt Abo Upgraden"). `DuplicatedPaywall` injects a second paywall after the third block on articles longer than 4 blocks (`pages/a/[slug].tsx`). `hauptstadt-subscribe.tsx` extends `SubscribeBlock` to auto-redirect into upgrade mode; memberplan-picker and subscription-list-item overrides complete the flow. `pages/mitmachen.tsx` renders CMS page `mitmachen` (the subscribe form arrives as a Subscribe block) with form fields `firstName`, `address`, `emailRepeated`. Session handling is unique: `HTTP_ONLY_COOKIE: true` + `pages/api/cookie.ts` (GET/POST/DELETE httpOnly cookie) + `AsyncSessionProvider`.

## Peering
No peered-content rendering components in the app. `PeerProfileDocument` is prefetched in page `getStaticProps` (standard builder pattern) and the theme defines a `peerInformation` typography variant used by shared article components, but there is no Bajour-style peer showcase or teaser peer logo handling.

## Notable routes & features
Standard api routes plus `api/cookie.ts`. `pages/a/[slug].tsx` adds paywall-context plumbing (strips the `articleId` bypass param once the paywall clears) and exports print-targeted wrappers. The `/l/*` print-magazine short links and legacy-tag redirects in `next.config.js` document the print↔online bridge; the reader font-size modal is registered through `FontSizeProvider`.

## Sources
- `apps/hauptstadt/pages/_app.tsx`, `next.config.js`, `deployment.config.json`, `pages/a/[slug].tsx`, `pages/mitmachen.tsx`, `pages/api/cookie.ts`
- `apps/hauptstadt/src/theme.tsx`, `src/print-styles.tsx`, `src/hooks/inform-user-upgrade.ts`
- `apps/hauptstadt/src/components/{hauptstadt-paywall,hauptstadt-subscribe,hauptstadt-memberplan-picker,hauptstadt-premium-indicator,font-size-picker}.tsx`
