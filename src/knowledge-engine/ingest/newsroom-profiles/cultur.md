# Cültür — We.Publish implementation profile

**Newsroom:** cultur (https://cültür.ch)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/cultur/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
Cültür is a newsletter-first We.Publish frontend: it is the only app in this batch that talks to the Mailchimp Marketing API server-side, pulling the four latest sent campaigns at build time and rendering them inside a "Daily Briefing" custom teaser on the homepage, plus a dedicated `/newsletter` signup page posting directly to a Mailchimp list. The reading experience itself is close to the reference implementation — a yellow (`#FBFB06`) Open Sans theme with restyled teaser, break block and footer — and the site deliberately hides login/subscribe buttons in the navbar; there is no signup, profile, or member checkout route at all.

## Stack & structure
Next.js (pages router) Nx app; no app-local `package.json`. Route skeleton follows `apps/website-example/` minus membership: no `mitmachen.tsx`, `signup.tsx` or `profile/*` — only `login.tsx` survives, and a `newsletter/index.tsx` page is added. `src/` is small: `cultur-teaser.tsx`, `cultur-break.tsx`, `footer.tsx`, `theme.tsx`, `components/daily-briefing/`, `components/newsletter/`. `pages/_app.tsx` wires `blocks.BaseTeaser: CulturTeaser`, `blocks.Break: CulturBreakBlock`, and a custom `Footer`; the navbar passes `loginBtn={null}` and `subscribeBtn={null}`. `next.config.js` exposes `MAILCHIMP_SIGNUP_URL` publicly and `MAILCHIMP_API_KEY`/`MAILCHIMP_SERVER_PREFIX` server-side; `deployment.config.json` sets custom domain `https://cültür.ch` and Mailchimp env (secret env var name `MAILCHIMP_API_KEY`).

## Theming & design
`src/theme.tsx` extends `@wepublish/ui`: Open Sans everywhere (next/font/google), primary `#FBFB06` (yellow) with dark contrast text `#383A4D`. Component overrides give inputs a translucent white background and 12 px radius, buttons 4 px radius, and recolor links/chips to the dark ink color. `footer.tsx` makes the footer transparent with a yellow `FooterPaperWrapper`; `cultur-break.tsx` inverts the break block (dark background, yellow text, grey buttons).

## Custom blocks & content features
- **DailyBriefingTeaser** (`daily-briefing/daily-briefing-teaser.tsx`) — CustomTeasers with preTitle `daily-briefing` render a yellow box listing recent Mailchimp campaigns (subject line linking to `long_archive_url`). Campaign data flows through a React `DailyBriefingContext` populated in `pages/index.tsx` `getStaticProps`, which calls `mailchimp.campaigns.list` (count 4, sent, sorted by send_time, scoped to a folder id) using the server-side API key; Mailchimp errors are sent to Sentry.
- **CulturTeaser** — `cond` dispatcher: daily-briefing teasers → DailyBriefingTeaser, everything else → a restyled `BaseTeaser` (no pretitle background, no hover zoom).
- The article page adds the same tag-filtered "related articles" list and comments section as siblings, with slightly different JSX nesting than website-example.

## Integrations
- **Mail/newsletter:** Mailchimp twice over — server-side Marketing API for campaign archives (homepage briefing teaser) and a plain HTML form POST to a Mailchimp list-manage signup URL on `/newsletter` (first name, last name, email, hidden `SOURCE` field prefillable via query params). The form's signup URL is hardcoded in `pages/newsletter/index.tsx` even though `MAILCHIMP_SIGNUP_URL` is also configured.
- **Monitoring:** Sentry (shared `@wepublish/utils/sentry` wiring + `captureException` on Mailchimp failures).
- Analytics and payment providers: not present.

## Membership & paywall
Effectively disabled at the UI level: `withPaywallBypassToken`/`withSessionProvider`/`withJwtHandler` wrappers are present (standard `_app.tsx` composition), but the navbar hides both login and subscribe buttons, and there are no signup, profile, subscription, or member-plan pages. Reader revenue runs through the newsletter funnel instead.

## Peering
No custom peering UI; `PeerProfileDocument` is prefetched in page `getStaticProps` as in the reference implementation.

## Notable routes & features
`/newsletter` — ISR page rendering CMS page slug `newsletter` plus the Mailchimp form. `src/components/newsletter/briefing-page.tsx` is a fully bespoke marketing landing layout (header/blob/sections driven by props, styled by `/newsletter/styles.css`) that is defined but not imported by any page at this commit. Homepage is ISR (60 s), constrained width (`ContentWidthProvider fullWidth={false}`), prefetching page/navigation/peer profile alongside the Mailchimp call. Standard api routes (feeds, sitemap, revalidate, health).

## Sources
- `apps/cultur/pages/_app.tsx`, `next.config.js`, `deployment.config.json`, `pages/index.tsx`, `pages/newsletter/index.tsx`, `pages/a/[slug].tsx`
- `apps/cultur/src/theme.tsx`, `src/components/{cultur-teaser,cultur-break,footer}.tsx`
- `apps/cultur/src/components/daily-briefing/`, `src/components/newsletter/`
