# BKA — We.Publish implementation profile

**Newsroom:** bka (no site URL — no custom domain configured, deployment disabled)
**Derived from:** wepublish/wepublish @ 7a2e66b — `apps/bka/`
**Generated:** 2026-06-11 (machine-generated, confidence: likely)

## In one paragraph
At this commit, `apps/bka/` is a placeholder, not an implementation: the directory contains a single `deployment.config.json` and nothing else — no Next.js pages, no `next.config.js`, no theme, no components. The deployment config explicitly disables deployment for all three environments (production, staging, review), each with empty `env` and `secret_env`. Whatever BKA is or was planned to be, there is no frontend code to profile; every section below is "not present" by inspection of the directory tree.

## Stack & structure
Not present. The only file is `apps/bka/deployment.config.json`. There is no `pages/` directory, no `project.json` (so it is not even a buildable Nx target at this commit), no `src/`, no `public/`, no TypeScript config.

## Theming & design
Not present — no theme files exist.

## Custom blocks & content features
Not present — no components exist.

## Integrations
Not present. The deployment config declares no env vars and no secret env var names for any environment.

## Membership & paywall
Not present.

## Peering
Not present.

## Notable routes & features
None. `deployment.config.json` sets `"deployment": false` for `production`, `staging`, and `review`, with `"env": {}` and `"secret_env": []` in each — the CI/CD pipeline is told to skip this app entirely. No `custom_domain` is configured, so no site URL can be derived from the repo. The practical takeaway for the knowledge base: a directory under `apps/` with only a deployment config is how a reserved/retired tenant slot looks in this monorepo (compare `apps/babanews/`, which instead disables deployment by renaming the file to `deployment.config.json_disable` while keeping its code).

## Sources
- `apps/bka/deployment.config.json` (the only file in the app directory)
- Directory listing of `apps/bka/`
