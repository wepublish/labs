# Flimmer — We.Publish implementation profile

**Newsroom:** flimmer (https://flimmer.media)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/flimmer/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Flimmer is a lightly-customized We.Publish frontend with a distinctive visual identity — Rubik type, all-black primary/secondary, magenta accent (`#FF00AC`) on a cream background (`#FFFAEF`) — and a handful of styled-component overrides (teaser, break block, rich text, title, navbar) rather than any new block types. It is the only app in this batch wired for Stripe checkout (`thirdParty.stripe`) and the only one using Piwik PRO analytics, injected as an inline tag-manager script. Its `next.config.js` carries an unusually long legacy-redirect list, several entries of which appear inherited from the tsri app's config, and its article page is the only one in the batch rendering full author boxes inside the article.

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json`. Reference route set with one omission: no `signup.tsx` (login, mitmachen, profile + subscription pages all present). `src/` holds five small files: `flimmer-navbar.tsx`, `flimmer-teaser.tsx`, `flimmer-break-block.tsx`, `flimmer-richtext.tsx`, `theme.tsx`. `pages/_app.tsx` wires `Navbar: FlimmerNavbar`, `PaymentAmount: PaymentAmountPicker`, `blocks: {BaseTeaser, Break, RichText, Title}` (Title is an inline styled `FlimmerTitle` shrinking to 2rem on mobile) and `thirdParty.stripe`; it loads `locales/deOverriden.json` (navbar subscribe → "Unterstützen"). `next.config.js` exposes `GA_ID`, `SPARKLOOP_ID`, `STRIPE_PUBLIC_KEY` publicly and `MAILCHIMP_API_KEY`/`MAILCHIMP_SERVER_PREFIX` server-side — but only `STRIPE_PUBLIC_KEY` is referenced in app code; the rest are declared and unused at this commit. `deployment.config.json` sets custom domain `https://flimmer.media` with empty env.

## Theming & design
`src/theme.tsx` extends `@wepublish/ui`: Rubik (next/font/google) for every typography variant (body1 pinned to 16px), palette primary `#000000`, secondary `#000000`, accent `#FF00AC`, background default `#FFFAEF`. One component override enlarges large contained buttons. `FlimmerNavbar` centers and width-caps the navbar inner wrapper to the `lg` breakpoint; `FlimmerTeaser` strips pretitle backgrounds, hover zoom and empty-image min-height from `BaseTeaser`; `FlimmerBreakBlock` renders accent-magenta breaks with secondary-colored buttons and responsive heading sizes; `FlimmerRichText` bumps body copy to 1.25em.

## Custom blocks & content features
No new block types or block-style dispatchers — all four block overrides are pure styled-component restyles of upstream blocks. The article page (`pages/a/[slug].tsx`) diverges from website-example by rendering an `ArticleAuthor` box for each author inside `ArticleContainer` (wrapped in a full-width `AuthorWrapper`) and using a custom `AfterArticleTitle` (H2, responsive) above the tag-filtered related-articles list; comments section is standard.

## Integrations
- **Payment:** Stripe via `thirdParty.stripe` (`STRIPE_PUBLIC_KEY` env var) with the builder `PaymentAmountPicker` as the PaymentAmount component.
- **Analytics:** Piwik PRO — an inline tag-manager loader in `_app.tsx` pulling from `flimmer.containers.piwik.pro` (container id hardcoded in the script). `GA_ID` is plumbed through config but no GoogleAnalytics component is rendered.
- **Mail/newsletter:** not wired in code; `MAILCHIMP_*` and `SPARKLOOP_ID` env names exist in `next.config.js` only.
- **Monitoring:** Sentry (shared `@wepublish/utils/sentry` wiring).

## Membership & paywall
Standard wrappers (`withPaywallBypassToken`, session/JWT HOCs). `mitmachen.tsx` renders CMS page slug `mitmachen` with a richer-than-template `getInitialProps`: it runs `handleJwtLogin`, prefetches `MemberPlanListDocument` (take 50), navigation and peer profile, and — when a session exists — `MeDocument` and `InvoicesDocument`. `_app.tsx` defines a styled `MitmachenInnerStyled` (bordered `SubscribePage` limited to `firstName`) that is not referenced anywhere at this commit. Self-service: login + profile + subscription pages; no signup page.

## Peering
No custom peering UI; `PeerProfileDocument` is prefetched in page `getStaticProps` (homepage, slug pages, mitmachen) as in the reference implementation.

## Notable routes & features
Standard api routes (feeds, sitemap, revalidate, health); ISR homepage (60 s, byte-identical to eenews). `next.config.js` redirects: `/a/:id/:slug → /a/:slug`, `/redaktion → /author`, `/agenda → /event`, `/account/* → /profile`, plus several campaign short-links to specific articles and two entries that look copied from tsri's config (`/zh/rubrik/:slug → /a/tag/:slug`, `/tipp → /a/crowdfunding-tsueritipp`).

## Sources
- `apps/flimmer/pages/_app.tsx`, `next.config.js`, `deployment.config.json`, `pages/mitmachen.tsx`, `pages/a/[slug].tsx`, `locales/deOverriden.json`
- `apps/flimmer/src/theme.tsx`
- `apps/flimmer/src/components/{flimmer-navbar,flimmer-teaser,flimmer-break-block,flimmer-richtext}.tsx`
