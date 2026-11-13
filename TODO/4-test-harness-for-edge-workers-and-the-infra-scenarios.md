# 4 — Test harness for Edge Workers and the infra scenarios

## Summary
Build a test harness for the Cloudflare Workers and a runner for `war-infra`'s Gherkin
scenarios.

## Current state
- Workers in `war-infra/edge/`: `media-router.js`, `scheduled-tasks.js` and
  `ui-default.js` have dependency-free `node:test` coverage using fake bindings and
  platform APIs, rather than a Workers runtime. Custom UI hosting was removed and
  will be rebuilt with the registry.
- `war-infra/specs/features/pending/routing.feature` still has no executable bindings.
  It covers API routing, default UI deep links and per-War link-preview tags.
- Infrastructure script regressions cover rendering, monitoring, shared database
  ownership and the R2 transition; a runtime-backed acceptance harness remains unbuilt.

## Technical notes
- Candidate approaches: Workers unit tests on a local runtime (Miniflare,
  `@cloudflare/vitest-pool-workers` or `wrangler dev`) for the scripts; a Gherkin runner (e.g.
  playwright-bdd as in `war-ui-default/tests/acceptance`, or cucumber-js) for the feature files.
  Move scenarios out of `pending/` as they gain bindings. Nothing decided.

## Dependencies
- Helps #1, which changes the routing the scenarios describe.

## Open questions
- Which runtime and runner, and whether scenarios run against a local emulation or deployed
  staging.
