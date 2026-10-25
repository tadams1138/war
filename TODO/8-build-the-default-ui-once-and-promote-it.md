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

B was chosen; see Decisions below.

## Dependencies
- #6 would let the routing be tested; #2 shares the `/ui/*` edge routing.

## Decisions (2026-10-25)
- **Option B,** Cloudflare Workers static assets, deployed by Terraform. The UI is built once
  in CI as a run artefact; staging deploys it and production deploys the same artefact.
  `VITE_API_BASE_URL` is unset, so one build serves both environments.
- **The Cloudflare provider moves to v5 (5.11.0 or later) in all three stacks** (shared,
  staging, production) in the same change. The upgrade lands first, and every plan must show
  no destroy and no recreate: `cloudflare_record` becomes `cloudflare_dns_record`, and
  `cloudflare_zone_settings_override` becomes one `cloudflare_zone_setting` per setting.
- **`og-tags-router` is merged into the UI Worker,** which reads the shell through its assets
  binding. Settings: `run_worker_first = ["/wars/*"]` and
  `not_found_handling = "single-page-application"`.
- **`/ui/default/*` is dropped.**
- **Routes:**
  - `/*` goes to the UI Worker;
  - `/api/v1/*` is a route with no Worker, so it reaches App Platform;
  - `/media/*` and `/ui/*` are unchanged.
- **App Platform keeps only the API.**
- **An infra plan never needs the UI build.** The UI Worker script and its `/*` route share
  one Terraform root, which only the app pipeline applies.
- **Caching follows spec §12.4.** The shell keeps the assets default
  (`max-age=0, must-revalidate`). `/assets/*` gets one year, immutable, through a `_headers`
  file. The edge purge step goes away.
- **Production cutover has no downtime:** the Worker and route go live and pass the smoke
  tests before the static site leaves the app spec.
- **Before the first production apply, a one-off manual check on staging** covers route
  precedence, same-zone subrequests, and whether the `run_worker_first` array form keeps the
  SPA fallback. If the SPA fallback breaks, stop and ask; `run_worker_first = true` is not an
  acceptable fallback.
