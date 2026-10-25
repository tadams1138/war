# Progress

This file lists only work that is not yet done. When something ships, delete its entry here
and make sure [`war-spec.md`](war-spec.md) (behaviour) and the "Deployment and operations"
section of [`README.md`](README.md) (operation) describe it.

## Not built

- **`video` media mode.** No schema yet (the media table is image-only), no video-mode
  matchups in the default UI. Scenarios wait in `war-api/specs/features/pending/` and
  `war-ui-default/features/pending/`.
- **Custom UI registry and shared runtime.** No registry endpoints or schema (the registry
  table and the War slug column were dropped until it is built) and no shared runtime
  artifact for custom UIs. Spec sections 6.5 and 11.
- **Apple sign-in, and linking several providers to one voter.** Apple is out of scope until
  a paid Apple Developer Program membership ($99/yr) exists for this project; the remaining
  question is that cost, not design. The client secret is an ES256-signed JWT (`iss` the team
  id, `sub` the client id, signed with a `.p8` key and re-signed per exchange, since Apple
  caps its lifetime at six months). There is no userinfo endpoint, so identity is `sub` from
  the id token alone. `openid` scope only (no `name`/`email`) keeps the callback an ordinary
  GET instead of `form_post`. It slots into the same provider abstraction as the other four.
- **Monitoring and alerting** beyond the App Platform alerts: no error tracking, no latency or
  error-rate alerts, no alert on failed scheduled runs, no retry on a failed scheduled run
  (spec 12.7 describes the target state).
- **A test harness for the Edge Workers** and **a runner for `war-infra`'s scenarios**
  (`war-infra/specs/features/pending/routing.feature` has no binding for that reason).
- **SSRF and DNS-rebinding protection.** Nothing fetches a user-supplied URL today, so none
  exists. If that need returns, recover the address classifier and connect-time
  DNS-rebinding guard from git history rather than rewriting them.

## Known defects and limitations

- **The default UI is rebuilt from `master` HEAD per deploy**, so production builds whatever
  `master` is at approval time rather than the commit staging validated. The API image and app
  spec are exact per-commit artefacts; the UI is not. See "Default UI hosting" below.
- **Address rate limits are off: `TRUST_PROXY_HOPS` is not set.** Verify the real hop count
  between the internet and the API, then set it per environment (procedure: README "Rate
  limiting"). Until then the edge's coarse auth rule is the only address-keyed protection.
- **Admin indexes are built without `CONCURRENTLY`**, so each build locks writes to its
  table. Fine at the current size; revisit before the `votes` table is large.
- **Edit War contestant forms discard unsaved edits.** Unsaved name and bio edits in a
  contestant's editor, and in the add-contestant form, are discarded when the creator selects
  another pane. The War metadata form keeps its unsaved edits.
- **Facebook sign-in is hidden in the UI** (Google, Microsoft and X only) until Meta business
  verification completes (see Owner actions). The API still serves it; restoring the button is
  one line in `war-ui-default/src/pages/Login.tsx`.
- **Best-effort storage cleanup leaves orphans.** After a delete, Remove or Ban, a storage
  failure is logged and leaves orphaned objects; the request still succeeds.
- **Untested paths.** No test covers: a storage failure during upload cleanup; a contestant
  removed from its War mid image upload; a long bio on a phone when neither contestant has
  media.

## Owner actions

- **Facebook business verification.** App Review for the Login product is blocked until a
  verified business account exists.
- **Seed the first Admin on production** (unconfirmed whether done; the owner's notes say it
  had not run as of 2026-10-09). Procedure: README "First-time setup of an environment".
- **Create the `infra-shared` GitHub Environment with a required reviewer before the
  `ci/consolidate-pipelines` branch merges**; otherwise GitHub creates it unprotected and the
  shared Terraform apply goes ungated.

## Open decisions

### Default UI hosting (decision pending; note of 2026-10-24)

The default UI is an App Platform static site built from source at deploy time, in the same
app as the API, so every API deploy rebuilds the UI. Goal: build once in CI, promote the same
files, deploy the UI independently of the API. The full note:
`git show 00d6eec:docs/superpowers/specs/2026-10-24-default-ui-hosting.md`.

Constraints:

- The edge module binds `ui_router` to `/ui/*` only (Worker quota is spent on custom-UI
  traffic only).
- `og-tags-router.js` fetches the shell by a same-origin `fetch(request)`, which today
  resolves to App Platform. Once the UI leaves App Platform that fetch has no shell to
  read: the og logic must be merged into the assets Worker, or reach it through a service
  binding.
- Deep links must return `index.html` with 200 (index no-store, hashed assets immutable;
  spec section 12.4).
- The Cloudflare provider is `~> 4.40`.
- `client.ts` falls back to same-origin `/api/v1`, so one build serves both environments.

Options:

- **A. Spaces + a Worker on `/*`:** about 8 Worker invocations per page view (Free quota of
  100k/day gone near 12k page views/day) and the whole site sits behind the Worker. The og
  shell-source problem is easiest here, since the Worker owns the shell.
- **B. Cloudflare Workers static assets** (`assets` block, `not_found_handling =
  "single-page-application"`, route `/*`, a no-script route for `/api/v1/*`): asset
  requests cost no invocation; atomic per-version deploy and one-command rollback. The og
  shell-source problem applies (merge og into the assets Worker or use a service binding).
- **C. Stay on App Platform:** no Worker cost, but pinning the UI to the validated commit
  likely needs a container service (an extra instance).

**Recommendation: B**, with `run_worker_first = ["/wars/*"]` so only the og-tags path spends
quota, after confirming the provider path. If the provider v4 to v5 upgrade is unwanted now,
deploy the assets Worker with Wrangler from CI and manage only its route in Terraform, or do
C now and B later. Not A.

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
