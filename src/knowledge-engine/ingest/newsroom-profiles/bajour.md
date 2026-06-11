# Bajour — We.Publish implementation profile

**Newsroom:** bajour (https://bajour.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/bajour/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Bajour is a Basel local-news outlet running the most block-style-driven We.Publish frontend of the pilot batch. It keeps the standard Website Builder page set but layers on a custom block renderer dispatching editor-assigned block styles (FrageDesTages, SearchSlider, BestOfWePublish, four "Briefing" variants, Archive) to bespoke React components. Visual identity is a pink/rose Roboto theme on a custom `MainGrid` layout, and it is the clearest example of consuming peered content via a dedicated "Best of We.Publish" showcase block.

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json` — dependencies come from the monorepo root, like all apps. Same route skeleton as `apps/website-example/` but diverges heavily in `src/`: `components/website-builder-overwrites/` (block/teaser/comment/banner overrides), `components/{archive,article-charts,best-of-wepublish,briefing,briefing-newsletter,frage-des-tages,search-slider}/` (block-style features), `components/layout/` (`MainGrid`). `pages/_app.tsx` wires these via `WebsiteBuilderProvider` and wraps content in `MainGrid` instead of the example's MUI `Container`. `next.config.js` adds legacy redirects (`/spende`, `/unterstuetzen`, `/member-uebersicht` etc. → `/mitmachen`).

## Theming & design
`src/styles/theme.ts` extends `@wepublish/ui` theme: Roboto (next/font/google), primary `#FF0D63` (pink), secondary `#FDDDD2`, accent `#770A6A`, custom breakpoints (sm 700, xl 3800), bold 3px-outlined buttons. A second `navbarTheme` swaps primary→secondary so the navbar renders in the rose tone. Footer styled via emotion override of `FooterContainer`.

## Custom blocks & content features
Dispatch hub is `src/components/website-builder-overwrites/block-renderer/block-renderer.tsx` (ramda `cond` over block-style predicates):
- **FrageDesTages** (`frage-des-tages/`) — "question of the day": TeaserList style rendering a poll block plus inline threaded comments, author box, info box; article variant `fdt-article.tsx`.
- **SearchSlider** (`search-slider/search-slider.tsx`) — keen-slider archive slider over articles tagged `search-slider`, with search bar and like buttons.
- **BestOfWePublish** (`best-of-wepublish/`) — peered-article showcase grid (see Peering).
- **Briefings** (`briefing/basel-briefing.tsx`) — BaselBriefing/FCBBriefing/FasnachtsBriefing/EscBriefing styles with bundled background images and a time-slot helper.
- **Archive** (`archive/archive.tsx`, `archive-slider.tsx`).
- Teaser variants (`blocks/{teaser,single-teaser,small-teaser,wide-teaser,news}.tsx`, `teaser-slider/bajour-teaser-slider.tsx`) plus custom `Break`, `Quote`, `Title`, `ContextBox`, `Banner`, `Comment`/`CommentListContainer`. The renderer hides legacy trailing "related articles" grids. `article-charts/article-charts.tsx` renders a "hot and trending" CustomTeaser (preTitle `article-charts`); `src/bajour-article-date-with-share.tsx` replaces `ArticleDate` with a date+share row.

## Integrations
- **Payment:** Stripe via `thirdParty.stripe` (`STRIPE_PUBLIC_KEY` env var).
- **Analytics:** Google Analytics (`GA_ID` env var) via `@next/third-parties`.
- **Mail/newsletter:** Mailchimp popup script injected when a `?popup` query param is present (`MAILCHIMP_POPUP_SCRIPT_URL` env var); `briefing-newsletter/briefing-newsletter.tsx` renders newsletter signup inside articles.
- **Monitoring:** Sentry (`sentry.client.config.ts`, `withSentryConfig`).

## Membership & paywall
`pages/mitmachen.tsx` wraps the shared `SubscribePage` (field: `firstName`, member plans filtered to tag `selling`) inside `PageContainer` slug `mitmachen`. Standard `withPaywallBypassToken` wrapper in `_app.tsx`; no custom Paywall component — default builder paywall behaviour. Full `login`/`signup`/`profile/*` self-service routes present.

## Peering
Yes — the most explicit peering consumer in the pilot batch. `best-of-wepublish/best-of-wepublish.tsx` + `best-of-wepublish-teaser.tsx` render a branded "Best of We.Publish" grid of peered `ArticleTeaser`s with peer logos overlaid (`PeerLogoWrapper`) and an ecosystem footer/CTA. `PeerProfileDocument` is prefetched in page `getStaticProps` (e.g. `pages/index.tsx`, `pages/a/[slug].tsx`).

## Notable routes & features
Standard api routes (feeds, `sitemap`, `revalidate`, `health`). Homepage is ISR, prefetching page, navigation, peer profile, hot-and-trending, comments and settings; renders CMS page slug `home` full-width in the custom grid. The article page composes FdT article mode, search-slider mode (tag-gated), a related-article slider, and the briefing newsletter box.

## Sources
- `apps/bajour/pages/_app.tsx`, `next.config.js`, `deployment.config.json`, `pages/{index,mitmachen}.tsx`, `pages/a/[slug].tsx`
- `apps/bajour/src/styles/theme.ts`
- `apps/bajour/src/components/website-builder-overwrites/block-renderer/block-renderer.tsx`
- `apps/bajour/src/components/{frage-des-tages,search-slider,best-of-wepublish,briefing,archive,article-charts}/`
