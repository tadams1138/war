# Default UI hosting: decision note

Date: 2026-10-24. Status: for decision (Task 9, no production change).

## Problem

The default UI (`war-ui-default`, a Vite React SPA) is an App Platform static site built from source at deploy time, in the same app as the API (`war-infra/platform/staging.yaml`: `static_sites`, plus ingress rules for `/` and `/ui/default`). So:

- Every API deploy rebuilds the UI.
- Production builds `master` HEAD at approval time, not the commit staging validated.

Goal: build once in CI, promote the same files, deploy the UI independently of the API.

## Constraints

- `edge` module binds `ui_router` only to `/ui/*`, so Worker quota is spent on custom-UI traffic only.
- `og-tags-router.js` rewrites `<head>` on `/wars/:id`. It fetches the shell by a same-origin `fetch(request)`, which today resolves through the apex CNAME to App Platform.
- Deep links must return `index.html` with HTTP 200; `index.html` no-store, hashed assets immutable (spec section 12).
- `client.ts` falls back to same-origin `/api/v1`, so one build serves both environments.
- Provider is `cloudflare/cloudflare ~> 4.40`.

## Verified Cloudflare facts

| Fact | Finding | Source |
|---|---|---|
| Static asset requests billed as Worker invocations | No. Requests that match an asset are "free and unlimited"; only requests that run the Worker script are billed. | [billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| `run_worker_first` on Free | Requests matching `run_worker_first` patterns always invoke the Worker and count against the free quota; over quota they get 429, not an asset fallback. `!/` negative patterns serve assets without invoking. | same |
| SPA mode | An unmatched request serves `/index.html` with 200. With a `main` script and compat date 2025-04-01 or later, navigation requests (`Sec-Fetch-Mode: navigate`) get index.html without running the Worker; other unmatched requests run the Worker. Setting `run_worker_first` disables that navigation detection. | [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) |
| Workers Free quota | 100,000 requests/day, resets midnight UTC; over it returns Error 1027. | [limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Static assets limits | 20,000 files/version (Free), 100,000 (Paid), 25 MiB/file. | same |
| Route with no script | Supported. A route without a Worker takes precedence over a less specific route, so that path skips Workers. Query strings defeat an exact-path match unless the pattern ends in `*`. Most specific pattern wins. | [routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) |
| Same-zone subrequests and routes | Docs state "Routes cannot be the target of a same-zone `fetch()` call." I read this as: a Worker's same-zone fetch does not re-trigger Worker routes and goes to the origin. The page does not spell out the general subrequest case. Treat as likely but confirm with a staging test. | same |
| Terraform | Static assets in `cloudflare_workers_script` shipped in provider v5.11.0 (2025-10-09). | [changelog](https://developers.cloudflare.com/changelog/post/2025-10-09-assets-terraform/) |

## Unverified

- Whether provider v4.x (`~> 4.40`) can deploy static assets. Search found nothing supporting it; I assume it cannot. Check the v4 `cloudflare_workers_script` docs/GitHub before relying on either answer.
- The exact same-zone subrequest behaviour (above). Needs a staging test.
- Actual current traffic. None was available to me.
- Whether the Free plan's 100k/day applies per account across all three Workers (assumed: yes, account-wide; not confirmed on the page I read).

## Traffic assumption

Unknown, so costs are stated per unit. Assume one page view loads about 8 requests to the UI host (index.html, JS and CSS chunks, fonts, icons) and that `/api/v1/*` and `/media/*` do not hit the UI Worker. Then:

- Worker on `/*` for the UI (A): about 8 invocations per page view. The 100k/day Free quota is reached near 12,000 page views/day. Beyond that the whole site returns errors, since the Worker sits in front of everything it matches.
- Static assets (B): asset requests cost 0 invocations. Only requests forced through the Worker (`/wars/*` for og tags) count.
- App Platform (C): 0 Worker invocations for the UI today; `/wars/*` already counts for og-tags-router.

Open question 1 asks for the real number.

## The three options

### A. Spaces plus a Worker bound to `/*`

Static build in a Spaces bucket behind its CDN. A Worker on `/*` serves it, rewriting misses to `index.html` with 200 (same as `ui-router.js` does for custom UIs). Worker-less routes for `/api/v1/*` and `/media/*` stop the Worker taking those.

### B. Cloudflare Workers static assets

A Worker with an `assets` block and `not_found_handling = "single-page-application"`, on route `/*`, with no-script routes for `/api/v1/*` and `/media/*`. Hashed assets cost nothing.

### C. Stay on App Platform

Keep `static_sites`. Fix the promotion problem inside App Platform (for example, build the UI image or artifact in CI and deploy it as a pinned source).

## Comparison

| | A. Spaces + Worker `/*` | B. Workers static assets | C. App Platform |
|---|---|---|---|
| Invocation cost | About 8 per page view; Free quota gone near 12k page views/day (assumption above). Breaks the "Worker quota for custom UIs only" rule. | Asset requests 0. Only `/wars/*` (og tags) invokes. Preserves the rule closely. | 0 for UI. |
| og-tags shell source | Same-origin fetch would go to App Platform (apex CNAME), which no longer has a shell. Must fetch the Spaces CDN host directly (new binding, as `ui-router.js` does) or call the new UI Worker by service binding. | Merge og logic into the assets Worker with `run_worker_first = ["/wars/*"]` and read the shell via `env.ASSETS.fetch`. Or keep og router and a service binding to the assets Worker. | Unchanged. |
| SPA deep link 200 | Worker rewrites 404 to `/index.html` 200. Must set cache headers itself (index no-store, assets immutable). | Built in by `not_found_handling`. Headers via a `_headers` file in the asset directory (to verify). If `run_worker_first` is set, navigation detection is off, so patterns must be exact. | Existing `catchall_document: index.html`. |
| Terraform added | Spaces bucket and CDN, a UI Worker script, `/*` route, no-script routes for `/api/v1/*` and `/media/*`, upload credentials. | One Worker script with assets, `/*` route, two no-script routes. Needs provider v5 (v4 unverified). | None. |
| Terraform removed | `static_sites` and its ingress from `platform/*.yaml`. | Same. | None. |
| CI/deploy | Upload build to Spaces keyed by `git rev-parse HEAD:war-ui-default`; purge CDN; promote by copying that prefix. Two steps, not atomic. | `wrangler deploy` (or Terraform) of the same build per environment; atomic per version. | Still builds at deploy; needs extra work to pin to the staging-validated commit. |
| Rollback | Re-point bucket prefix or redeploy previous Worker config; CDN purge needed. | Roll back to a previous Worker version (one command). | Redeploy previous API+UI together. |
| Risks | Worker is a single point of failure for the whole site; quota outage takes everything down; cache-header logic is ours to maintain; CDN purge lag. | Provider upgrade v4 to v5 (breaking, touches every Cloudflare resource in `edge` and `shared`); Free file limit 20k (ample); first-time route precedence between three Workers and no-script routes. Quota outage still limited to `/wars/*`. | Leaves the two original problems partly unsolved. |

## Recommendation

Choose B, with `run_worker_first = ["/wars/*"]` so only the og-tag path spends Worker quota, but only after confirming the provider path. If the v4-to-v5 upgrade is not wanted now, deploy the assets Worker with Wrangler from CI and manage only its route in Terraform, or do C now and B later. Do not choose A: it spends Worker quota on every asset request and puts the whole site behind the Worker.

## Open questions for you

1. Current daily page views (or Cloudflare request analytics) and the Workers plan (Free or Paid)?
2. Is a provider v4 to v5 upgrade acceptable now, or should the assets Worker be deployed by Wrangler from CI?
3. Keep `og-tags-router` as its own Worker, or merge it into the UI Worker?
4. Should `/ui/default/*` stay as an alias for the default UI, or go away with the App Platform ingress rule?
5. Is a staging test of same-zone subrequest and route precedence behaviour acceptable before committing to B?
