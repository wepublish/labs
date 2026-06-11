# baba news — We.Publish implementation profile

**Newsroom:** babanews (no site URL in repo — deployment config disabled; brand "baba news", Instagram link points to instagram.com/babanews.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/babanews/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
baba news is a magazine-style We.Publish frontend whose customization is concentrated on layout rhythm rather than new content types: a custom block renderer wraps every block in a 12-column `Container`/`FullWidthContainer` grid system, restyles TeaserList into an alternating left/right editorial list, and adds one bespoke block style — a black full-width Instagram banner driven by a Break block. Typographically it pairs Hanken Grotesk headings with Merriweather body text on a pink/yellow/mint palette. Notably, its `deployment.config.json` is renamed to `deployment.config.json_disable`, so the app is currently not deployed from this repo.

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json`. Route skeleton matches `apps/website-example/` with two structural differences: no `mitmachen.tsx` subscribe page and no `profile/subscription/*` pages (only `profile/index.tsx`). `src/` holds `components/website-builder-overwrites/` (block renderer, banner, list-teaser), `components/website-builder-styled/` (teaser grid/list restyles), `components/babanews/instagram-banner/`, and `components/layout/` (`MainGrid`, `Container`, `FullWidthContainer`). `pages/_app.tsx` wires `Renderer: BabanewsBlockRenderer`, `TeaserGrid: BabanewsTeaserGrid` and `blockStyles.Banner: BabanewsBanner`; footer categories `[['sonstiges','other'],['about-us']]`. `next.config.js` is the standard template (no redirects).

## Theming & design
`src/styles/theme.ts` extends `@wepublish/ui`: Hanken Grotesk (next/font/google) for headings/subtitles, Merriweather for body/button/caption. Palette: primary `#FF006B` (pink, header), secondary `#F5FF64` (banner), info `#7FFAB6` (details), error `#FF0D62`. Footer override forces white text via `FooterPaperWrapper`. A `src/styles/tsri-article.styles.tsx` file (article layout CSS borrowed from tsri, importing `ArticleTagList` from the article page) exists but is not imported anywhere — dead code at this commit.

## Custom blocks & content features
`block-renderer.tsx` (ramda `cond`) handles three cases, falling back to the default `BlockRenderer` inside `Container`:
- **InstagramBanner** — Break blocks with block style `Instagram` render as a full-width black banner linking to the baba news Instagram account (uppercase italic text, large Instagram icon, side image).
- **Break blocks** (non-Instagram) render full-width on `theme.palette.accent.main`.
- **TeaserList blocks** render through `BabanewsTeaserList` + `ListTeaser`: a 12-column list where every second teaser mirrors its grid (image right / text left, right-aligned) — an alternating editorial layout.
`BabanewsTeaserGrid` adds responsive fractional gutters for multi-column grids; `BabanewsBanner` wraps the default Banner full-width. The article page adds a tag chip list (`ArticleTagList`), a tag-filtered related-articles list (take 4, show 3) and comments gated on `disableComments`.

## Integrations
- **Monitoring:** Sentry via shared `@wepublish/utils/sentry` (`sentry.client.config.ts`, `instrumentation.ts`, `withSentryConfig`).
- Analytics, payment provider wiring, and mail/newsletter integrations: not present in app code or config.

## Membership & paywall
Standard `withPaywallBypassToken` + `withSessionProvider`/`withJwtHandler` wrappers in `_app.tsx`. `login`, `signup` and `profile/index` routes exist, but there is no `mitmachen`/subscribe page and no `profile/subscription/*` routes — no member-plan checkout flow is wired in this app.

## Peering
No custom peering UI. `PeerProfileDocument` is prefetched in page `getStaticProps` (e.g. `pages/index.tsx`, `pages/[slug].tsx`) as in the reference implementation; no peer-specific components or teaser logos.

## Notable routes & features
Standard api routes (rss/atom/json feeds, `sitemap`, `revalidate`, `health`). Homepage is ISR (60 s) rendering CMS page slug `""` full-width (`ContentWidthProvider fullWidth`) with link prefetch enabled. `_app.tsx` renders content inside a styled `ContentSpacer` (min-height 100vh) rather than the example's MUI `Container`; the actual width constraints live in the per-block `Container` of the block renderer. Deployment is switched off: the deployment config file is renamed `deployment.config.json_disable` (its contents would enable production/staging/review with no env vars).

## Sources
- `apps/babanews/pages/_app.tsx`, `next.config.js`, `deployment.config.json_disable`, `pages/index.tsx`, `pages/a/[slug].tsx`
- `apps/babanews/src/styles/{theme.ts,tsri-article.styles.tsx}`
- `apps/babanews/src/components/website-builder-overwrites/`, `src/components/website-builder-styled/`
- `apps/babanews/src/components/babanews/instagram-banner/`, `src/components/layout/`
