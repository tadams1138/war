# 6 — Test harness for Edge Workers and the infra scenarios

## Summary
Build a test harness for the Cloudflare Workers and a runner for `war-infra`'s Gherkin
scenarios.

## Current state
- Workers in `war-infra/edge/`: `media-router.js`, `og-tags-router.js`, `scheduled-tasks.js`,
  `ui-router.js`. None has a harness.
- `war-infra/specs/features/pending/routing.feature` has no binding for that reason. It covers
  API routing, default UI deep links returning `index.html` with 200, custom UI slug routing,
  and per-War link-preview tags.
- Existing infra test: `war-infra/scripts/render-spec.test.sh` (bash, deploy script only).

## Technical notes
- Candidate approaches: Workers unit tests on a local runtime (Miniflare,
  `@cloudflare/vitest-pool-workers` or `wrangler dev`) for the scripts; a Gherkin runner (e.g.
  playwright-bdd as in `war-ui-default/tests/acceptance`, or cucumber-js) for the feature files.
  Move scenarios out of `pending/` as they gain bindings. Nothing decided.

## Dependencies
- Helps #2 and #8, which change the routing the scenarios describe.

## Open questions
- Which runtime and runner, and whether scenarios run against a local emulation or deployed
  staging.
