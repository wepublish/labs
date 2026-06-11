# Fazetten — We.Publish implementation profile

**Newsroom:** fazetten (https://fazetten.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/fazetten/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Fazetten is the most typography- and teaser-engineered app in this batch: it ships two self-hosted typefaces (GT Super Text for body/lead, FFF Acid Grotesk for display/UI) with responsive type scales built via `responsiveProperty`, replaces the entire `Article` component and the TeaserSlots layout system, and contains a fully hand-rebuilt teaser (`WepTeaser`) — with a peer-logo overlay and a URL transform rewriting `-de`/`-fr` slug suffixes into `/de/...`/`/fr/...` language paths — underlying its one named block style, `LogoWall`, a responsive partner-logo grid. Membership uses the stock checkout flow with a "Unterstützen" navbar label; Google Analytics is the only third-party integration.

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json`. Full reference route set including `mitmachen`, `signup`, and `profile/subscription/*`; homepage is byte-identical to eenews/ganzgraz. `src/components/` holds `fazetten-article.tsx`, `fazetten-title-block.tsx`, `block-styles/` (enum: `LogoWall`), `teaser-layouts/` and `teasers/`. `pages/_app.tsx` wires `blocks: {Title, TeaserSlots, BaseTeaser}`, `blockStyles: {AlternatingTeaser}` and a full `Article` replacement, and loads `locales/deOverriden.json` (navbar "subscribe" → "Unterstützen"). `next.config.js` adds public `GA_ID`; `deployment.config.json` sets custom domain `https://fazetten.ch` and the production `GA_ID`.

## Theming & design
`src/theme.tsx` is the largest theme in the batch: local fonts via `next/font/local` from `public/fonts/` (GT Super Text; FFF Acid Grotesk). Display/title/teaser/button/caption variants use Acid Grotesk; body/lead/quotes use GT Super Text, all with responsive font-size/line-height/letter-spacing ramps (title 32→60 across breakpoints). Palette: primary green `#21CE8E`, secondary pink `#FD6A96`, accent yellow `#EEFF6A`, plus custom semantic colors. Overrides extend upstream MuiButton and restyle MuiAlert. Three derived sub-themes (`ContentTheme`, `AlternatingTeaserTheme`, `TeaserSlotsTheme`) are applied via `createWithTheme`; a `GlobalStyles` export adds `text-wrap: pretty` to headings.

## Custom blocks & content features
- **FazettenArticle** — replaces the builder `Article` wholesale, wrapped in `ContentTheme`.
- **FazettenBaseTeaserSlots** — `cond` dispatcher: `LogoWall`-styled teaser-slots blocks → `TeaserSlotsLogoWall`; default → upstream `TeaserSlotsBlock`. `FazettenTeaserSlots` reimplements the slots layout on a 12-column subgrid with its own 3-across alignment algorithm and optional slots title.
- **TeaserSlotsLogoWall / TeaserLogoWall** — auto-filling `minmax(150px,1fr)` grid of non-clickable image teasers, for partner/sponsor walls.
- **FazettenBaseTeaser** — `cond` dispatcher: `LogoWall` teasers → `TeaserLogoWall`, everything else → upstream `BaseTeaser`. The hand-rebuilt **WepTeaser** (`teasers/fazetten-teaser.tsx` — own primitives, 16:9 aspect, `selectTeaserPeerImage` peer-logo overlay, and a `transformPath` helper rewriting `/{slug}-de|-fr` URLs to `/de/{slug}`/`/fr/{slug}`) is only consumed as the base of `TeaserLogoWall` at this commit, not in the default teaser path.
- **FazettenAlternatingTeaser** — upstream `AlternatingTeaser` rethemed via `AlternatingTeaserTheme`.
- **FazettenTitleBlock** — Title blocks with block style `ExtraSpacing` get a top divider and extra padding.
- Article page diverges from website-example only by wrapping the related-articles/comments headings in `ArticleListWrapper`/`CommentListWrapper`.

## Integrations
- **Analytics:** Google Analytics via `@next/third-parties` `<GoogleAnalytics>`, gated on the `GA_ID` env var.
- **Monitoring:** Sentry (shared `@wepublish/utils/sentry` wiring).
- Payment provider config (`thirdParty`) and mail/newsletter integrations: not present.

## Membership & paywall
Standard wrappers (`withPaywallBypassToken`, session/JWT HOCs). `mitmachen.tsx` renders CMS page slug `mitmachen` and delegates to `SubscribePage.getInitialProps` (template pattern, same as eenews/ganzgraz). Full self-service routes. No custom Paywall component.

## Peering
No dedicated peering showcase. `WepTeaser` renders peer attribution (`selectTeaserPeerImage` → `TeaserPeerLogo` overlay), though it is currently only reached via the LogoWall block style. `PeerProfileDocument` is prefetched in page `getStaticProps` as usual.

## Notable routes & features
Standard api routes (feeds, sitemap, revalidate, health); ISR homepage (60 s) rendering CMS page slug `""` full-width. The `WepTeaser` URL language rewrite (`-de`/`-fr` suffix → path prefix) is the only multilingual signal in the batch.

## Sources
- `apps/fazetten/pages/_app.tsx`, `next.config.js`, `deployment.config.json`, `pages/a/[slug].tsx`, `locales/deOverriden.json`
- `apps/fazetten/src/theme.tsx`
- `apps/fazetten/src/components/{fazetten-article,fazetten-title-block}.tsx`, `src/components/block-styles/`
- `apps/fazetten/src/components/teaser-layouts/`, `src/components/teasers/`
