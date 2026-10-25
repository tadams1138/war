# 8 — Build the default UI once and promote it

## Summary
Build the default UI once in CI and promote the same files from staging to production,
deploying the UI independently of the API.

## Motivation
The default UI is an App Platform static site built from source at deploy time, in the same
app as the API, so every API deploy rebuilds the UI. The UI is therefore rebuilt from `master`
HEAD per deploy: production builds whatever `master` is at approval time rather than the
commit staging validated. The API image and app spec are exact per-commit artefacts; the UI is
not.

The full original note (decision pending, of 2026-10-24):
`git show 00d6eec:docs/superpowers/specs/2026-10-24-default-ui-hosting.md`.

## Acceptance criteria
- The UI bundle production serves is the one staging validated.
- The UI can be deployed without deploying the API.
- Deep links return `index.html` with 200 (spec §12.4).

## Technical notes
Constraints:
- The edge module binds `ui_router` to `/ui/*` only (Worker quota is spent on custom-UI traffic
  only): `war-infra/terraform/modules/edge/main.tf`.
- `war-infra/edge/og-tags-router.js` fetches the shell by a same-origin `fetch(request)`, which
  today resolves to App Platform. Once the UI leaves App Platform that fetch has no shell to
  read: the og logic must be merged into the assets Worker, or reach it through a service
  binding.
- Deep links must return `index.html` with 200 (index no-store, hashed assets immutable; spec
  section 12.4).
- The Cloudflare provider is `~> 4.40`.
- `war-ui-default/src/api/client.ts` falls back to same-origin `/api/v1`, so one build serves
  both environments.

Options:
- **A. Spaces + a Worker on `/*`:** about 8 Worker invocations per page view (Free quota of
  100k/day gone near 12k page views/day) and the whole site sits behind the Worker. The og
  shell-source problem is easiest here, since the Worker owns the shell.
- **B. Cloudflare Workers static assets** (`assets` block, `not_found_handling =
  "single-page-application"`, route `/*`, a no-script route for `/api/v1/*`): asset requests
  cost no invocation; atomic per-version deploy and one-command rollback. The og shell-source
  problem applies (merge og into the assets Worker or use a service binding).
- **C. Stay on App Platform:** no Worker cost, but pinning the UI to the validated commit
  likely needs a container service (an extra instance).

Recommendation: **B**, with `run_worker_first = ["/wars/*"]` so only the og-tags path spends
quota, after confirming the provider path. If the provider v4 to v5 upgrade is unwanted now,
deploy the assets Worker with Wrangler from CI and manage only its route in Terraform, or do C
now and B later. Not A.

## Dependencies
- #6 would let the routing be tested; #2 shares the `/ui/*` edge routing.

## Open questions
The decision (A, B or C) is pending.

Unverified:
- whether provider v4 can deploy static assets (static assets in `cloudflare_workers_script`
  shipped in v5.11.0);
- same-zone subrequest and route precedence behaviour (`/media/*`, `/ui/*`, `/wars/*` over a
  `/*` catch-all; needs a staging test);
- real daily page views and the Workers plan (the Free quota is believed account-wide,
  unconfirmed);
- whether `run_worker_first` in array form disables SPA navigation detection;
- whether App Platform can deploy a static site from a pinned commit.

Questions for the owner:
- traffic and plan;
- is a provider v5 upgrade acceptable now;
- keep `og-tags-router` separate or merge it into the UI Worker;
- keep `/ui/default/*` as an alias;
- is a staging test of subrequest and route precedence acceptable.
