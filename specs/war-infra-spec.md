# War — Infrastructure Specification
**Repo:** `war-infra`  
**Version:** 2.1  
**Status:** Draft  
**Date:** 2026-08-02

> **Changed in 2.0:** Hosting migrated from AWS to DigitalOcean, with Cloudflare at the edge.
> **Changed in 2.1:** Added scheduled tasks (§12), covering nightly War expiry reconciliation.
>
> This document is written **provider-agnostically**: §1–§14 define infrastructure in terms of
> roles and required behaviour, and every vendor-specific detail is confined to
> [§15 Provider Implementation](#15-provider-implementation). Changing providers should require
> rewriting §15 and the mapping table in §14 — nothing else.
> See [§18 Provider Rationale](#18-provider-rationale) for why DigitalOcean, and what was traded away.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Repository Structure](#2-repository-structure)
3. [Environments](#3-environments)
4. [Repos & Ownership](#4-repos--ownership)
5. [Hosting Architecture](#5-hosting-architecture)
6. [URL Routing](#6-url-routing)
7. [CDN & Static File Strategy](#7-cdn--static-file-strategy)
8. [CI/CD Pipelines](#8-cicd-pipelines)
9. [Environment Variables & Secrets](#9-environment-variables--secrets)
10. [Database Migrations](#10-database-migrations)
11. [Image Storage](#11-image-storage)
12. [Scheduled Tasks](#12-scheduled-tasks)
13. [Monitoring & Alerting](#13-monitoring--alerting)
14. [Infrastructure Roles](#14-infrastructure-roles)
15. [Provider Implementation](#15-provider-implementation)
16. [Cost Baseline](#16-cost-baseline)
17. [Out of Scope (v1)](#17-out-of-scope-v1)
18. [Provider Rationale](#18-provider-rationale)
19. [Gherkin Acceptance Tests](#19-gherkin-acceptance-tests)
20. [First Deploy — Lessons Learned](#20-first-deploy--lessons-learned)

---

## 1. Overview

`war-infra` is the single source of truth for all infrastructure, environment configuration, and CI/CD pipeline definitions across the War platform. It does not contain application code. All application repos (`war-api`, `war-ui-default`, `war-ui-{slug}`) reference pipeline templates defined here.

Infrastructure is defined as code (IaC) and all environment changes are applied via automated pipelines — no manual cloud console changes in staging or production.

### 1.1 Specification Style

This spec describes infrastructure by **role**, not by product name. Sections §1–§14 state what must be true of the platform; §15 states how those requirements are currently satisfied. Acceptance tests (§19) assert observable behaviour only and contain no vendor names, so they remain valid across a provider change.

The roles referenced throughout are:

| Role | Responsibility |
|---|---|
| **Edge** | DNS, TLS termination, CDN caching, WAF, rate limiting, DDoS mitigation |
| **Edge function** | Small request-time compute at the edge, used only where §6 requires it |
| **Application platform** | Runs the API service and hosts the default UI; owns path-based ingress within the app |
| **Database** | Managed PostgreSQL with a connection pooler and automated backups |
| **Object storage** | S3-compatible buckets for media, custom UI bundles, and IaC state |
| **Container registry** | Stores API container images |
| **Scheduler** | Invokes HTTP endpoints on a cron schedule (§12) |
| **Observability** | Error tracking, log aggregation, metric alerting |

---

## 2. Repository Structure

This project is one directory in the `war` monorepo (§20.6). Paths below are written
from the repository root; the pipelines sit at the root because GitHub reads workflows
only from `.github/workflows/` there.

```
war-infra/
├── terraform/
│   ├── modules/
│   │   ├── compute/          # Application platform app (identity only — see §8.5)
│   │   ├── data/             # PostgreSQL cluster, database, user, connection pool
│   │   ├── storage/          # Object storage buckets (media, custom UIs) + CDN
│   │   ├── scheduler/        # Cron-triggered tasks (§12)
│   │   └── edge/             # DNS, TLS, routing, cache rules, WAF, rate limits, worker
│   ├── shared/
│   │   └── main.tf           # Account/zone-scoped: registry, zone settings (§8.5)
│   └── envs/
│       ├── staging/
│       │   └── main.tf       # Backend + module composition
│       └── production/
│           └── main.tf
├── platform/
│   ├── staging.yaml          # Application platform deployment spec
│   └── production.yaml
├── edge/
│   ├── ui-router.js          # Edge function: custom-UI routing + SPA fallback (§6.1)
│   ├── media-router.js       # Edge function: /media/* → media CDN, edge-cached (§15.5)
│   └── scheduled-tasks.js    # Edge function: cron-triggered task dispatch (§12)
├── bootstrap/
│   └── Dockerfile            # Trivial image compute's app placeholder pins to (§15.2)
├── scripts/
│   ├── register-ui.sh        # Register a new custom UI slug
│   └── smoke-test.sh         # Post-deploy smoke tests
└── docs/
    └── runbook.md

.github/workflows/            # Repository root — GitHub reads workflows only from here
├── api.yml                        # Pipeline for war-api
├── ui-default.yml                 # Pipeline for war-ui-default
├── ui-custom.yml                  # Reusable pipeline for external war-ui-{slug} repos
├── infra.yml                      # Pipeline for war-infra (Terraform apply)
└── push-bootstrap-image.yml       # One-off: build+push bootstrap/Dockerfile (§15.2)
```

Terraform module names describe roles, not products. A provider change swaps each module's implementation while preserving its interface (inputs, outputs) so `envs/*/main.tf` is unaffected.

### 2.1 Terraform State

Remote state lives in a dedicated private bucket in object storage, via Terraform's S3-compatible backend. Concrete backend configuration is in §15.1.

State locking is **not** assumed to be available. Concurrent applies are prevented at the pipeline level by a per-environment concurrency group — see §8.4.

---

## 3. Environments

| Environment | Purpose | Deployment trigger |
|---|---|---|
| **staging** | Pre-production testing | Merge to `master` in any app repo |
| **production** | Live platform | Manual promotion after staging smoke tests pass |

All environments use isolated resources: separate application deployment, separate database cluster, separate buckets, separate hostnames, separate schedules.

| Environment | Hostname |
|---|---|
| staging | `staging.war.tmad.dev` |
| production | `war.tmad.dev` |

---

## 4. Projects & Ownership

| Project | Type | Pipeline |
|---|---|---|
| `war-api/` | Backend API (containerised) | `.github/workflows/api.yml` |
| `war-ui-default/` | Static SPA | `.github/workflows/ui-default.yml` |
| `war-infra/` | Infrastructure IaC | `.github/workflows/infra.yml` |
| `war-ui-{slug}` (separate repo) | Static custom UI (one per War brand) | `.github/workflows/ui-custom.yml` |

The first three are directories in this repository, and their pipelines are ordinary workflows triggered directly by `push` and `pull_request`. Each is scoped with a `paths:` filter so one project's change does not run another's pipeline, and their deploy jobs are gated on `github.event_name != 'pull_request'` rather than on a `deploy` input. There are no caller workflows: a pipeline and the code it builds now live in the same commit, so there is nothing left to delegate across.

Custom UIs are the exception, and the only remaining reusable-workflow consumer. Each `war-ui-{slug}` brand lives in its own repository — they are per-brand deliverables rather than part of the platform — and calls `ui-custom.yml` here.

```yaml
# Example in war-ui-miss-universe-2026/.github/workflows/deploy.yml
jobs:
  deploy:
    uses: tadams1138/war/.github/workflows/ui-custom.yml@master
    with:
      deploy: true          # slug defaults to the repo name minus `war-ui-`
    secrets: inherit
```

**`@master` resolves once per run, not per rerun** — a hazard that now applies only to these external callers. A reusable-workflow call resolves `@master` when the calling run is first *triggered* (a push, a `workflow_dispatch`) and keeps that resolution for the life of that run; re-running an existing run (`gh run rerun`, or the UI's "Re-run failed jobs") does not re-resolve it. So fixing a bug in `ui-custom.yml` and then re-running an old, already-failed run in a slug repo silently keeps executing the *old* copy. Prefer a fresh trigger over a rerun whenever `ui-custom.yml` changed since the run in question started. The platform's own pipelines are immune to this: a local workflow is resolved from the commit being run.

---

## 5. Hosting Architecture

```
      ┌───────────┐         ┌──────────────────────────────────────────┐
      │ SCHEDULER │────────▶│                  EDGE                     │
      │  (cron)   │  §12    │  DNS · TLS · CDN · WAF · Rate limiting    │
      └───────────┘         └───────────────────┬──────────────────────┘
                                        │
         ┌──────────────────────────────┼──────────────────────────────┐
         │                              │                              │
   /ui/{slug}/*                     /media/*                  everything else
   (edge function)                 (origin rule)                       │
         │                              │                              ▼
         ▼                              ▼            ┌─────────────────────────────────┐
┌────────────────────┐      ┌────────────────────┐   │      APPLICATION PLATFORM       │
│ OBJECT STORAGE     │      │ OBJECT STORAGE     │   │                                 │
│ war-ui-custom-{env}│      │ war-media-{env}    │   │  ingress /api/v1/*  → war-api   │
│  └─ {slug}/...     │      │  └─ contestants/   │   │  ingress /ui/default/* ─┐       │
└────────────────────┘      └────────────────────┘   │  ingress /*         → war-ui-   │
                                                      │                       default   │
                                                      └───────────┬─────────────────────┘
                                                                  │
                                                      ┌───────────▼─────────────┐
                                                      │        DATABASE          │
                                                      │  PostgreSQL + pooler     │
                                                      └──────────────────────────┘
```

### 5.1 Edge

- Owns the public hostname, DNS, and TLS termination
- Proxies all traffic; the origin is never addressed directly by clients
- Provides CDN caching (§7), WAF, and rate limiting (§13.1)
- Executes edge functions: the custom-UI router bound to `/ui/*` (§6.1), and scheduled task dispatch (§12)

### 5.2 Application Platform

A **single deployment per environment** containing two components:

| Component | Type | Source | Notes |
|---|---|---|---|
| `war-api` | Long-running service | Dockerfile in `war-api` | Fixed instance count in v1; no autoscaling |
| `war-ui-default` | Static site | `vite build` output from `war-ui-default` | Serves a catch-all document (§6.1) |

Required platform capabilities:

- **Path-based ingress** across components within one deployment, with per-rule control over whether the matched prefix is preserved or stripped
- **Catch-all document** for static components, returning `index.html` with HTTP 200 for unmatched paths
- **Zero-downtime rolling deploys** with health checks
- **Pre-deploy hooks** that can abort a deployment on non-zero exit (§10)
- **Encrypted environment variables** injected at runtime (§9)

**The MCP interface (`war-api-spec.md` §7.9) adds no third component.** It is new routes
(`/api/v1/mcp`, `/oauth/*`, `/.well-known/oauth-*`) on the existing `war-api` component,
covered by the ingress rule that already routes all of `/api/v1/*` (and, for the two
`/.well-known/*` and `/oauth/*` paths, a small addition to that ingress rule — no new
component, no new deploy pipeline, no new App Platform app). This also means §20.8's
per-pipeline-per-environment concurrency group requirement is satisfied trivially rather
than by adding groups: `api.yml`'s existing `deploy-staging-api` / `deploy-production-api`
groups already cover every deploy that ships this interface, because it is the same
component deploying through the same pipeline. No `deploy-{env}-mcp` group is created,
and none should be — there is no third pipeline for it to serialize, and adding one anyway
would be exactly the kind of unforced infrastructure this document otherwise avoids
(§16's cost baseline and §17's scope list both reflect the same discipline).

**One real capability to verify before this ships: long-lived Streamable HTTP connections.**
MCP's Streamable HTTP transport can hold a response open as a server-sent-events stream for
the duration of a tool call. App Platform's ingress and any intermediate proxy must not
apply a request-idle timeout shorter than the slowest tool call this interface will ever
serve (image upload and processing, §11.1, is the likely long pole). This is a configuration
value to confirm against the provider during `war-api-spec.md` §7.9's build (§4.3's slice
2), not a structural change recorded here — but a genuine way this feature could ship and
then fail silently under real latency if skipped.

**A second real gap, already live in slice 1, not merely a slice-2 risk: this environment's
reverse-proxy chain depth is undocumented, and the OAuth AS's own rate limiting depends on
it.** `GET /oauth/authorize` and `POST /oauth/token` (`war-api-spec.md` §4.3) rely on the
MCP SDK's own `express-rate-limit` default, keyed by `request.ip`. Behind any reverse proxy,
`request.ip` is only correct if Express's `trust proxy` setting is configured for the exact
number of proxy hops in front of the app — App Platform's own ingress is at least one such
hop, and this document does not currently state how many, or how to configure `trust proxy`
against it. Left unconfigured (as `a0a9a68`'s implementation deliberately left it, recorded
there as a known limitation rather than solved), every client behind the same ingress hop
is keyed into one shared bucket rather than limited individually — strictly better than no
limit at all, but not per-client accuracy. **Needed to close this:** the exact hop count
from a real client to this API's Node process in each environment, so `war-api`'s Express
bridge (`war-api-spec.md` §4.3.1) can set `trust proxy` correctly. Track down and record
that count here before treating this as resolved; until then, the limitation stands exactly
as `war-api-spec.md` §15 records it.

### 5.3 Database

- One managed PostgreSQL cluster per environment
- A **connection pooler** in transaction mode fronts the cluster; the API connects through the pooled connection string, never the direct one
- Network access restricted to the application platform — the cluster is not reachable from the public internet
- Automated daily backups with point-in-time recovery
- Production runs with a standby node for HA; staging runs single-node

### 5.4 Object Storage

| Bucket | Contents | Access |
|---|---|---|
| `war-media-{env}` | Contestant images (§11) | Public read |
| `war-ui-custom-{env}` | All custom UI bundles, under `{slug}/` | Public read |
| `war-tfstate` | Terraform remote state | Private |

Buckets must expose an S3-compatible API so standard tooling works with an endpoint override.

### 5.5 Custom UI Hosting

**All custom UIs share one bucket behind one origin**, keyed by slug prefix:

```
war-ui-custom-{env}/
├── miss-universe-2026/
│   ├── index.html
│   └── assets/...
└── best-pizza-nyc/
    ├── index.html
    └── assets/...
```

There is no per-slug bucket, no per-slug CDN origin, and no per-slug routing rule. Registering a new slug is a **database row plus a file upload**. It requires no IaC run, no origin or routing change, and no redeploy of any existing component.

> **Design note.** The prior design used one bucket, one CDN origin, and one routing behaviour per slug. That makes every registration an infrastructure change, and on a platform that routes by component it additionally consumes a per-deployment component budget and forces a full redeploy. Because custom UIs are unbounded by design — one per War brand — that cost grows without limit. The shared-bucket model removes per-slug infrastructure entirely on any provider, at the cost of requiring the edge function in §6.1. See [§18.3](#183-decisions-made-during-migration).

---

## 6. URL Routing

Routing is split between the edge (path → origin) and the application platform (path → component).

| Path pattern | Routed by | Target | Notes |
|---|---|---|---|
| `/api/v1/internal/*` | Edge (blocked) | — | Rejected at the edge except from the scheduler (§12.3) |
| `/api/v1/*` | Platform ingress | `war-api` | Forwarded as-is; prefix preserved, no rewrite |
| `/ui/default/*` | Platform ingress | `war-ui-default` | Prefix stripped |
| `/ui/{slug}/*` | Edge function | `war-ui-custom-{env}`, key `{slug}/...` | Single origin for all slugs; SPA fallback applied by the function |
| `/media/*` | Edge origin rule | `war-media-{env}` | Prefix stripped; long-lived cache. The bucket's `originals/` prefix is **not** routed and is never publicly reachable (§11) |
| `/*` (catch-all) | Platform ingress | `war-ui-default` | Default UI serves all unmatched paths |

Edge rules are evaluated before a request reaches the application platform, in the order listed. The `/ui/*` edge function route explicitly excludes `/ui/default/*`, which is served by the platform.

### 6.1 SPA Fallback Rule

Every static UI must serve `index.html` with **HTTP 200** for any path that does not match a file, so client-side routing works on deep links.

| Origin | Mechanism |
|---|---|
| `war-ui-default` (platform) | Platform catch-all document — native, returns 200 |
| `war-ui-{slug}` (object storage) | Edge function — on a 404 from storage, re-fetches `{slug}/index.html` and returns it with status 200 |

Object storage typically cannot rewrite a 404 to a 200 while serving alternate content; where it offers an error document, the response retains a 404 status. The edge function exists to close that gap, and is the mechanism that makes the single-bucket model in §5.5 viable:

```js
// edge/ui-router.js — bound to /ui/* (excluding /ui/default/*)
export default {
  async fetch(request, env) {
    const url  = new URL(request.url)
    const [, , slug, ...rest] = url.pathname.split('/')   // /ui/{slug}/{...rest}
    const base = `${env.STORAGE_CDN_ORIGIN}/${slug}`      // one origin, slug is a key prefix

    const direct = await fetch(`${base}/${rest.join('/')}`, request)
    if (direct.status !== 404) return direct

    const shell = await fetch(`${base}/index.html`)        // SPA fallback
    return new Response(shell.body, {
      status: 200,
      headers: { ...Object.fromEntries(shell.headers), 'cache-control': 'no-store' },
    })
  },
}
```

The function is bound only to `/ui/*`, so the bulk of platform traffic never invokes it and any per-invocation quota applies to custom-UI traffic alone. Adding a slug requires no change to this function.

### 6.2 Custom UI Slug Resolution

The API's `ui_registrations` table maps `slug → static_base_path` (see `war-api-spec.md` §10). Because all custom UIs live under one bucket behind one origin, `static_base_path` is always `/ui/{slug}/` and the routing layer needs no per-slug configuration. `scripts/register-ui.sh` inserts the registry row and uploads the initial bundle — it makes no infrastructure calls.

---

## 7. CDN & Static File Strategy

Caching is layered: the edge in front of everything, and the platform's and storage's own CDNs behind it.

| Asset class | `Cache-Control` | Set by |
|---|---|---|
| Hashed JS/CSS/assets | `public, max-age=31536000, immutable` | Build output + upload metadata |
| `index.html` (custom UIs) | `no-store` | Upload metadata / edge function |
| `index.html` (default UI) | `public, max-age=10, s-maxage=86400` — fixed by App Platform, no override exists; see below | App Platform static component |
| `/runtime/v{n}.js` | `public, max-age=600, stale-while-revalidate=86400` | Platform static component |
| Contestant images | `public, max-age=31536000, immutable` | API on upload (§11) |
| API responses | Per-endpoint; default `no-store` | `war-api` |

**The shared runtime is the one deliberate exception to content hashing.** Custom UIs load `/runtime/v1.js` by a stable path rather than importing a bundled copy (`war-ui-default-spec.md` §5.2), so the filename cannot carry a hash. The ten-minute TTL with `stale-while-revalidate` means a runtime fix reaches every custom UI within ten minutes of a default-UI deploy without any brand redeploying, while clients never block on revalidation. Breaking changes ship at a new path (`/runtime/v2.js`) rather than mutating this one.

- Content-hashed filenames come from the Vite build, so asset URLs change on every deploy and never require invalidation
- Only `index.html` is purged on deploy, by explicit URL
- Edge cache rules bypass the cache entirely for `/api/v1/*` unless an endpoint sets its own `Cache-Control`

**Why the default UI's `index.html` doesn't need the same `no-store` the custom-UI stack guarantees.** `no-store` matters because deploys **delete** the previous build's hashed assets — a client holding a stale `index.html` would reference files that no longer exist. The custom-UI Spaces+Worker stack is fully self-controlled, so it costs nothing to guarantee `no-store` exactly there. App Platform's static-site hosting has no such override (confirmed against DO's own docs and open community feature requests asking for one) — its `s-maxage=86400` is, right now, inert: Cloudflare's default cache level doesn't cache HTML at all without an explicit "Cache Everything" rule, and none exists for these routes (`terraform/shared/main.tf`'s cache ruleset deliberately has none, with a comment explaining why). What a browser actually bounds by is `max-age=10`, short enough to self-heal on the next real navigation. `scripts/smoke-test.sh`'s `ui-default` check accepts `no-store` or any `max-age` ≤ 60s for exactly this reason — revisit both it and the ruleset comment together if a "Cache Everything" rule is ever added for these routes, since that would make `s-maxage` start mattering.

---

## 8. CI/CD Pipelines

Stage names below are provider-neutral. The concrete commands backing each stage are in §15.6.

### 8.1 `.github/workflows/api.yml` — war-api

```
Trigger: push to master (in war-api repo)

Stages:
  lint          →  eslint + tsc --noEmit
  test          →  vitest (unit + integration, against test DB)
  build         →  docker build
  push          →  push image to container registry
  deploy-stg    →  trigger platform deployment (staging)
                   (pre-deploy hook runs migrations — see §10)
  smoke-test    →  scripts/smoke-test.sh staging api
  deploy-prod   →  (manual approval gate) trigger platform deployment (production)
  smoke-test    →  scripts/smoke-test.sh production api
```

Migrations run inside the deployment as a pre-deploy hook, not as a separate pipeline stage, so a failed migration aborts the deployment and never ships a new image.

### 8.2 `.github/workflows/ui-default.yml` — war-ui-default

```
Trigger: push to master (in war-ui-default repo)

Stages:
  lint          →  eslint
  typecheck     →  tsc --noEmit
  test          →  vitest
  acceptance    →  playwright (against mocked API)
  build         →  vite build
  deploy-stg    →  trigger platform deployment (staging)
  purge         →  purge edge cache for staging index.html
  smoke-test    →  scripts/smoke-test.sh staging ui-default
  deploy-prod   →  (manual approval gate) trigger platform deployment (production)
  purge         →  purge edge cache (production)
  smoke-test    →  scripts/smoke-test.sh production ui-default
```

The platform builds the static site from source on deployment; the pipeline's `build` stage is a fast-fail check, not the artefact that ships.

### 8.3 `.github/workflows/ui-custom.yml` — war-ui-{slug}

```
Trigger: push to master (in any war-ui-{slug} repo)

Stages:
  resolve-slug  →  derive slug from repo name; validate against ^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$
  lint          →  npm run lint
  build         →  npm run build
  template-check→  assert war-detail, vote-mode, rankings templates present
  size-check    →  assert dist/ total < 2MB
  deploy-stg    →  sync dist/ to war-ui-custom-staging/{slug}/
  purge         →  purge edge cache for /ui/{slug}/index.html
  smoke-test    →  scripts/smoke-test.sh staging ui {slug}
  deploy-prod   →  (manual approval gate) sync same artefact to war-ui-custom-production/{slug}/
  purge         →  purge edge cache (production)
  smoke-test    →  scripts/smoke-test.sh production ui {slug}
```

**Slug resolution.** The slug defaults to the calling repository's name with the `war-ui-` prefix stripped, so `war-ui-miss-universe-2026` deploys to the `miss-universe-2026` prefix with no per-repo configuration. A `slug` input overrides it.

**Slug validation is a security control, not cosmetic.** Because all custom UIs share one bucket (§5.5), the slug is a storage key prefix. An unvalidated slug containing `../` could write into a *different* custom UI's prefix. The pattern above is enforced before any sync runs, and its 64-character bound matches `ui_registrations.slug` in `war-api-spec.md` §6.

**Sync.** Targets a key prefix within the shared bucket — it creates no infrastructure. Two passes are required, because `index.html` and the hashed assets need opposite caching (§7): first `--exclude index.html` with a long-lived immutable header and `--delete` to clear stale assets, then `index.html` alone with `no-store`. `--delete` is confined to the slug's prefix, so it cannot affect another custom UI.

**Promotion.** Production redeploys the artefact staging validated, never a rebuild — the build is produced once and carried between stages.

Build tooling is addressed through npm scripts (`lint`, `build`) rather than named tools, so a custom UI may use any toolchain that exposes those two scripts.

### 8.4 `.github/workflows/infra.yml` — war-infra

```
Trigger: push to master (in war-infra repo)

Concurrency: group = terraform-{env}, cancel-in-progress = false

Stages:
  validate      →  terraform validate + tflint
  plan-stg      →  terraform plan (staging)
  apply-stg     →  terraform apply (staging, auto-approve)
  plan-prod     →  terraform plan (production)
  apply-prod    →  (manual approval gate) terraform apply (production)
```

The concurrency group substitutes for state locking where the state backend does not provide it (§2.1).

### 8.5 Ownership Boundaries

Three things own infrastructure, and the boundaries between them are deliberate.

| Owner | Owns | Why not the others |
|---|---|---|
| `terraform/shared/` | Container registry, zone-wide TLS and security settings, WAF/rate-limit/cache rulesets | Account- and zone-scoped; creating any of these from both environments would conflict — Cloudflare permits exactly one custom ruleset per phase per zone, and a from-scratch production apply failed outright the first time this was tried per-environment |
| `terraform/envs/{env}/` | Database, buckets, CDN, DNS record, per-env Workers (media/UI routing), scheduler, **app identity** | Long-lived resources that change on infrastructure review cadence |
| `platform/{env}.yaml` | The **application spec** — components, ingress, env vars, migration hook | The image tag changes on every merge; pinning it in Terraform would make every application deploy a `terraform apply` |

**The app is created by Terraform and specified by the YAML.** `modules/compute` creates `digitalocean_app` with a placeholder spec and `lifecycle { ignore_changes = [spec] }`; the first pipeline deploy replaces that spec with the real one and Terraform never reverts it. Without the `ignore_changes`, every `terraform apply` would roll the running API back to the placeholder image.

The practical rule: **after bootstrap, change `platform/{env}.yaml`, not the compute module.** Its spec block is inert.

Apply order on a clean account is `shared` → `staging` → `production`, then a first deploy from each app repo to populate the app specs.

Alerts are declared in both the compute module and the YAML. This duplication is intentional: it means a mistake in the deploy pipeline cannot silently drop monitoring.

---

## 9. Environment Variables & Secrets

Secrets are held as **encrypted environment variables on the application platform**. They are never stored in any repo.

They reach the app through `platform/{env}.yaml`, not Terraform: that file's `type: SECRET` entries carry no literal value (only a `${PLACEHOLDER}`), and the `war-api` deploy pipeline (`.github/workflows/api.yml`) substitutes the current value from a GitHub Actions secret via `envsubst` immediately before every `doctl apps update --spec`, the same way it already substitutes `${IMAGE_TAG}`. Terraform's role is limited to creating the app once with a bootstrap placeholder (§15.2); it never sets or touches these values, so `terraform apply` does not need them and does not redact them.

`envsubst` is called with an explicit variable list (`envsubst '$IMAGE_TAG $JWT_SECRET ...'`), not bare `envsubst`. This is load-bearing: unrestricted, `envsubst` substitutes *every* `$VAR`/`${VAR}` it finds — and `platform/{env}.yaml`'s `run_command` for the `war-api` service and the `migrate` job deliberately contains `$DATABASE_CA_CERT` as a literal shell reference for the container to expand at its own runtime (see the "Why `DATABASE_CA_CERT` exists at all" note above). An unrestricted `envsubst` clobbered that reference with an empty string during rendering, since `DATABASE_CA_CERT` isn't among the pipeline's own env vars — confirmed via the rendered command showing up in the App Platform console as `echo ""`, not `echo "$DATABASE_CA_CERT"`. Every new `${PLACEHOLDER}` added to `platform/{env}.yaml` for this step to substitute must be added to that variable list too, or it silently stops being substituted instead of erroring.

Because every deploy re-renders the spec from the current secret value, **rotation is just updating the GitHub Actions secret and triggering any deploy** (even a no-op one) — not a separate procedure, and not a `terraform apply`. An unrelated deploy (bumping a dependency, changing an ingress rule) re-submits the same current value along with it, which DO simply re-encrypts; nothing else changes.

| Variable | Used by | Description |
|---|---|---|
| `DATABASE_URL` | war-api | PostgreSQL **pooled** connection string (bound from the managed cluster) |
| `DATABASE_CA_CERT` | war-api | CA cert for the managed cluster's TLS, bound from the platform (`${db.CA_CERT}`) |
| `JWT_SECRET` | war-api | JWT signing key |
| `INTERNAL_TASK_TOKEN` | war-api, scheduler | Shared secret authenticating scheduled task calls (§12.3) |
| `GOOGLE_CLIENT_ID` | war-api | Google OAuth client id — not secret; a plain (non-`SECRET`-type) env var |
| `GOOGLE_CLIENT_SECRET` | war-api | Google OAuth client secret |
| `PUBLIC_BASE_URL` | war-api | This API's own public base URL — not secret; already declared literally in `platform/{env}.yaml` for both environments; now consumed by the app (previously unused there) to derive the Google OAuth redirect URI |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | war-api | Object storage credentials for media uploads (Spaces access key/secret) |
| `S3_BUCKET` | war-api | Bucket name for contestant images |
| `S3_ENDPOINT` | war-api | S3-compatible endpoint for object storage |
| `S3_PUBLIC_BASE_URL` | war-api | Public base URL used to construct image URLs |
| `UI_ORIGINS` | war-api | Allowed CORS origin(s) and the OAuth callback's post-login redirect target — not secret; same domain as `PUBLIC_BASE_URL` in this shared-domain architecture |
| `VITE_API_BASE_URL` | war-ui-* | API base URL (injected at build time) |

`DATABASE_URL` and `DATABASE_CA_CERT` are bound by the platform from the attached database rather than set manually. Apple, Facebook, Microsoft, and Twitter/X OAuth credentials are deliberately absent from this table — those providers are out of scope for this slice (§13) and nothing consumes them; add rows here when a provider is actually implemented, not before.

**`PUBLIC_BASE_URL` is now a required, consumed-by-the-app deployment variable — this requires no addition to either `platform/{env}.yaml`, since both already declare it literally** (`https://staging.war.tmad.dev` / `https://war.tmad.dev`). It's been there all along for a different consumer: §15.7 documents this same name and value as a GitHub Actions **Environment** variable, used by the deploy pipeline's `environment: url:` and its smoke-test/cache-purge step — that mechanism is separate and unchanged by this. The gap this closes is narrower: `war-api`'s own `loadConfig` never read `env.PUBLIC_BASE_URL` at all — only `env.S3_PUBLIC_BASE_URL`, a distinct, media-specific value that serves contestant image URLs — so the value already sitting in the running container's environment was silently ignored.

`AppConfig` gains a top-level `publicBaseUrl: string` field (a sibling of `port`, `databaseUrl`, etc. — not nested under `google`, and not to be confused with the existing, unrelated `s3.publicBaseUrl`): `env.PUBLIC_BASE_URL ?? \`http://localhost:${port}\`` (reusing the already-computed `port`, itself `env.PORT ?? 3000` — so the local-dev default becomes `http://localhost:3000`, identical to today's hardcoded value). `google.redirectUri` is no longer its own env-var-backed field; it is derived: `` `${publicBaseUrl}/api/v1/auth/google/callback` ``. Locally this still resolves to `http://localhost:3000/api/v1/auth/google/callback`, exactly as today; in staging/production it resolves from the real deployed `PUBLIC_BASE_URL` to `https://staging.war.tmad.dev/api/v1/auth/google/callback` / `https://war.tmad.dev/api/v1/auth/google/callback`. **No change to either `platform/{env}.yaml` or the `envsubst` variable list in `war-api`'s deploy pipeline (`.github/workflows/api.yml`) is needed** — `PUBLIC_BASE_URL` is already correctly declared, literally, in both.

`assertProductionConfig` (`war-api/src/config.ts`) refuses to boot if `publicBaseUrl` is left at its localhost default — the same fail-fast guarantee this section previously specified as a dedicated `GOOGLE_REDIRECT_URI` check, now aimed at this field instead (that env var no longer exists). Because the local-dev default depends on the configured port (`` `http://localhost:${port}` ``, not one fixed literal), this isn't a plain identity check against a single exported string like `DEFAULT_JWT_SECRET`; compute the default the same way `loadConfig` does — a small helper taking `port`, shared by both — and compare `publicBaseUrl` against that, so the two cannot drift apart.

This check exists because a deployment left on the default previously redirected real users back to `http://localhost:3000/...` after Google sign-in instead of the real domain — in every deployed environment, since the app never read `PUBLIC_BASE_URL` at all — with nothing in the deploy pipeline or the running process ever erroring. Required unit-test coverage, in `war-api/test/unit/config.test.ts`, following that file's existing `assertProductionConfig` convention exactly (plain Vitest `describe`/`it`, the `fullyPopulatedConfig()` fixture, Arrange/Act/Assert comments):

**A second Google redirect URI needs manual registration, and nothing in this pipeline does it for you.** The OAuth 2.1 authorization server (`war-api-spec.md` §4.3, `config.google.oauthServerRedirectUri`) derives its own callback the same way — `` `${publicBaseUrl}/api/v1/oauth/google/callback` `` — distinct from the browser flow's `/api/v1/auth/google/callback` above. Both are computed from the same `PUBLIC_BASE_URL`, so no new environment variable or pipeline change is needed to produce the value; what's missing is that **Google itself only accepts a redirect URI it has been told about in advance**. This second URI must be added as an additional authorized redirect URI on the same Google Cloud OAuth client (`GOOGLE_CLIENT_ID` above) — one more entry in the console, per environment (staging and production each need their own, exactly as the existing browser-flow URI already does) — before the authorization server's `GET /oauth/authorize` can complete a real Google login. This is a one-time, per-environment, human-run step in the same category as §20.4's `DO_APP_ID` — easy to forget precisely because the code and config are already correct without it, and the failure mode (Google's own `redirect_uri_mismatch` error) surfaces at the authorization server's callback, not anywhere this pipeline would catch it before a real user hits it.

- `assertProductionConfig` throws when `publicBaseUrl` equals its localhost default for the configured port — mirrors the existing "left at its published test default" cases for `jwtSecret`/`internalTaskToken` — with a problem message a case-insensitive match distinguishes from every other check's message.
- `assertProductionConfig` throws when `publicBaseUrl` is the empty string — mirrors the existing "DATABASE_URL is unset" case. (`loadConfig` itself never produces an empty string here — its `??` fallback always supplies at least the localhost default — so this case exercises `assertProductionConfig` directly against a config object with the field overwritten after construction, the same way the existing tests mutate `config.jwtSecret`/`config.databaseUrl`.)
- `assertProductionConfig` does not throw when `publicBaseUrl` is a real, non-default value (e.g. `https://staging.war.tmad.dev`), and in that case `google.redirectUri` reads `https://staging.war.tmad.dev/api/v1/auth/google/callback`.
- `fullyPopulatedConfig()`'s env fixture must itself set `PUBLIC_BASE_URL` to a real value (e.g. `https://staging.war.tmad.dev`). Without this, the existing "does not throw for a fully-populated production config" case starts failing the moment the new check lands, because that fixture currently leaves `PUBLIC_BASE_URL` unset and falls through to the localhost default.

Separately, `war-api/.env.example` drops its `GOOGLE_REDIRECT_URI=...` line (no longer a thing to set) and gains a commented-out `# PUBLIC_BASE_URL=http://localhost:3000` note — optional locally, with a sensible default, and required only in a real deployment (enforced by `assertProductionConfig` above).

**`UI_ORIGINS` closes the same bug class a third time — this one found by auditing rather than waiting for another user report.** After the `PUBLIC_BASE_URL`/OAuth-redirect fixes above, a full grep of `war-api/src/config.ts` for every `?? 'http...'`/`` ?? `http...` `` fallback turned up one more unguarded field: `uiOrigins` (env `UI_ORIGINS`), used both for CORS and — critically — as the OAuth callback's post-login redirect target (`config.uiOrigins[0]`). Like the other two, it was never declared in either `platform/{env}.yaml`, so it silently fell back to `http://localhost:5173` in every deployed environment; a user's otherwise-successful login landed them back on `localhost`. Both platform files now declare it literally, same domain as `PUBLIC_BASE_URL` (this architecture serves the API and the default UI from one shared domain per environment): `https://staging.war.tmad.dev` / `https://war.tmad.dev`. `assertProductionConfig` gained a matching guard — refusing to boot when `uiOrigins` is empty or still exactly `[DEFAULT_UI_ORIGIN]` — closing the same observability gap the `publicBaseUrl` guard closed, for the same reason: three rounds of this exact bug shape is the signal that every localhost-shaped default needs a guard, not just the one that most recently broke.

**Why `DATABASE_CA_CERT` exists at all.** DO's managed Postgres presents a cert signed by a cluster-specific private CA, which isn't in Node's default trust store — connecting with only `DATABASE_URL` fails outright ("self-signed certificate in certificate chain"). Both the `war-api` service and the `migrate` job in `platform/{env}.yaml` override their `run_command` to write `DATABASE_CA_CERT` to a file and set `NODE_EXTRA_CA_CERTS` before starting the real process, rather than changing how the app or `node-pg-migrate` construct their connections.

**CI/CD credentials** are held as GitHub Actions secrets: a platform API token (deployments, registry login, IaC), object storage access keys (sync + Terraform backend), and an edge API token with zone ID (DNS/rules management and cache purge). Concrete names are in §15.7.

### 9.1 Known Limitation

Platform-encrypted environment variables provide encryption at rest but no versioning, per-component access policy, or access audit trail. Rotation history is whatever GitHub Actions' own secret-update log retains — there is no separate audit trail on the DigitalOcean side.

If the secret inventory grows past this — or an audit trail becomes a requirement — introduce a dedicated secrets manager and inject at container start. Deliberately deferred; see §17.

---

## 10. Database Migrations

- Migrations are plain SQL files in `war-api/db/migrations/`, named `001_init.sql`, `002_add_ui_slug.sql`, etc.
- Applied in order by a **pre-deploy hook** that runs before the new revision receives traffic
- The hook uses the same image as the API service and runs the migration runner as its command
- A `schema_migrations` table tracks which migrations have been applied
- Migrations must be **backwards-compatible** (no destructive column drops until the old code is fully retired) — the hook runs while the previous revision is still serving
- If the hook exits non-zero, the deployment is aborted and the previous revision continues serving
- Rollback is manual (documented in `docs/runbook.md`); the cluster's point-in-time recovery is the backstop

---

## 11. Image Storage

Contestant images are uploaded via `war-api` and stored in object storage:

Images are **processed on upload and never served as uploaded** — see `war-api-spec.md` §11.1 for the processing rules.

```
war-media-{env}/
├── contestants/{contestant_id}/{image_id}-400.webp     (public)
├── contestants/{contestant_id}/{image_id}-800.webp     (public)
├── contestants/{contestant_id}/{image_id}-1600.webp    (public)
└── originals/{contestant_id}/{image_id}.{ext}          (private, never served)
```

- Served via the edge at `https://war.tmad.dev/media/contestants/{contestant_id}/{image_id}-{width}.webp`
- Uploads are handled server-side by the API using any S3-compatible SDK against the storage endpoint
- Variants are public-read; no signed URL required for display
- **Originals are private** and retained only so variant widths can be changed later without re-uploading. The `originals/` prefix is not routed at the edge (§6)
- Max upload size: 10MB per file (enforced by API); accepted formats JPEG, PNG, WebP
- Objects are written with `Cache-Control: public, max-age=31536000, immutable`; keys are content-addressed so they are never overwritten

**Cost impact.** Image delivery is the dominant traffic driver for the platform, so this is the single largest lever on the egress figure in §16. A 400px WebP is typically 20–40KB against a multi-megabyte original — serving unprocessed uploads to a two-card mobile view would raise bandwidth by two orders of magnitude while making the experience worse.

---

## 12. Scheduled Tasks

Some platform behaviour is time-driven rather than request-driven. The **scheduler** role invokes API endpoints on a cron schedule.

| Task | Schedule | Endpoint | Purpose |
|---|---|---|---|
| Close expired Wars | Daily, 03:00 UTC | `POST /api/v1/internal/close-expired-wars` | Materialise `status = 'closed'` for Wars whose `ends_at` has passed |

Required scheduler capabilities: cron-expression scheduling, per-environment isolation, retry on transient failure, and an emitted success/failure signal that §13 can alert on.

### 12.1 Scheduled tasks are never authoritative

**A scheduled task must never be the only thing standing between the platform and incorrect behaviour.** If the scheduler does not run, the platform must still behave correctly — only its stored state may lag.

For War expiry this means the API evaluates `ends_at` **lazily on every read and write**: a War whose end date has passed is treated as closed from that instant, regardless of the `status` column's value, so votes are rejected the moment the War expires. The nightly task exists only to converge the stored `status` so that list queries can filter on an indexed column instead of a computed expression.

The consequence is that a missed run degrades query efficiency and reporting freshness, never correctness. See `war-api-spec.md` §5.1 for the effective-status rule this depends on.

### 12.2 Idempotency

Every scheduled task must be safe to run repeatedly, concurrently, and after an arbitrary delay. `close-expired-wars` selects only Wars where `status = 'active' AND ends_at <= now()`, so a re-run after a successful run is a no-op.

### 12.3 Authentication

Internal task endpoints are protected in two layers:

1. **Edge** — `/api/v1/internal/*` is rejected at the edge for all callers except the scheduler (§6, first row)
2. **API** — the endpoint requires an `X-Internal-Token` header matching `INTERNAL_TASK_TOKEN` (§9), and returns `401` otherwise

Internal endpoints accept no user JWT and are never exposed to clients. They are excluded from the public API surface documented in `war-api-spec.md` §7.

### 12.4 Failure Handling

- A failed run is retried once, 15 minutes later
- Two consecutive failed runs raise an alert (§13)
- Because §12.1 holds, a failed run is a housekeeping incident, not an outage

---

## 13. Monitoring & Alerting

Signals are grouped by the role that produces them, so a provider change re-points sources without changing thresholds.

| Signal | Source role | Alert threshold |
|---|---|---|
| API error rate (5xx) | Edge analytics / log aggregation | > 1% over 5 min |
| API p99 latency | Log aggregation (derived from access logs) | > 2000ms over 5 min |
| Unhandled exceptions | Error tracking | Any new issue in production |
| API CPU utilisation | Platform metrics | > 80% over 5 min |
| API memory utilisation | Platform metrics | > 80% over 5 min |
| API restart loop | Platform metrics | > 3 in 10 min |
| Deploy failure | Platform metrics + GitHub Actions | Any failed deployment or pipeline stage |
| Domain / TLS failure | Platform metrics | Any |
| DB connection pool | Database metrics | > 80% utilisation |
| DB disk / CPU | Database metrics | > 80% |
| Edge 4xx spike | Edge analytics | > 5% over 5 min |
| Rate limit triggers | Edge analytics | Sustained trigger rate (informational) |
| Scheduled task failure | Scheduler | 2 consecutive failed runs (§12.4) |

**Log pipeline.** The application platform forwards component logs to the log aggregation vendor. Retention target: 7 days staging, 30 days production.

**Alert routing.** All alerts route to a nominated Slack channel or email, configured in Terraform where the provider supports it and in the platform deployment spec otherwise.

> **Note.** Request-level signals (5xx rate, p99 latency) are the two rows most likely to have no native equivalent on a given platform. Any provider evaluation must confirm how these are satisfied; see §18.2.

### 13.1 Edge Protection

The edge provides:

- **WAF managed rules** — enabled in production
- **Rate limiting** — applied to `/api/v1/auth/*` (10 requests/10s per address — the Free Cloudflare plan only permits a 10-second counting period in this phase, not the original 60s). The Free plan also permits exactly one rule in this phase per zone; an equivalent rule for the vote endpoint was dropped for that reason (see `terraform/shared/main.tf`) and is not a gap — vote submission is already bounded by the API's own per-voter, per-matchup limits (one vote per side, enforced server-side). Revisit both constraints if the plan changes.
- **DDoS mitigation** — always on
- **Internal endpoint blocking** — `/api/v1/internal/*` rejected for all callers except the scheduler (§12.3)

### 13.2 Content Security Policy

Served on all UI documents. Video Wars (`war-api-spec.md` §11.3) embed third-party players, so `frame-src` carries a **closed allow-list** — the only third-party origins the platform ever frames:

```
default-src 'self';
img-src     'self' data: https://i.ytimg.com https://i.vimeocdn.com;
frame-src   https://www.youtube-nocookie.com https://player.vimeo.com;
script-src  'self' https://www.youtube.com https://player.vimeo.com;
connect-src 'self';
object-src  'none';
base-uri    'self';
```

Adding a video provider means changing this policy, which is a reviewed infrastructure change. That is the intent: it makes an arbitrary third-party embed impossible to introduce from application code or from a database value alone. The API reinforces this by storing a provider name and video id rather than a URL (`war-api-spec.md` §7).

`img-src` admits the two providers' thumbnail CDNs because poster images are served from them directly rather than being copied into our own storage.

Edge protection was previously deferred ("revisit at scale") and is now in scope for v1.

---

## 14. Infrastructure Roles

The role → product mapping. **This table and §15 are the only places a provider is named.**

| Role | Current choice |
|---|---|
| IaC | Terraform |
| Edge (DNS, TLS, CDN, WAF, rate limiting) | Cloudflare |
| Edge function | Cloudflare Workers |
| Scheduler | Cloudflare Workers Cron Triggers |
| Application platform | DigitalOcean App Platform |
| Database | DigitalOcean Managed PostgreSQL (PgBouncer pool) |
| Object storage | DigitalOcean Spaces |
| Container registry | DigitalOcean Container Registry (DOCR) |
| CI/CD | GitHub Actions (reusable workflows) |
| Secrets | Application platform encrypted env vars (§9.1) |
| Error tracking | Sentry |
| Log aggregation | Vendor TBD (Better Stack / Axiom / Papertrail) |
| Terraform state backend | Object storage, S3-compatible |

Application-level stack choices (Node/TypeScript, Fastify, React, Vite, Tailwind, Vitest, Playwright) are specified in `war-api-spec.md` and `war-ui-default-spec.md`.

---

## 15. Provider Implementation

Everything below is specific to the products named in §14. A provider migration rewrites this section.

### 15.1 Terraform State Backend

```hcl
terraform {
  backend "s3" {
    endpoints                   = { s3 = "https://nyc3.digitaloceanspaces.com" }
    bucket                      = "war-tfstate"
    key                         = "envs/{env}/terraform.tfstate"
    region                      = "us-east-1"   # ignored by Spaces; required by the backend
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = false
  }
}
```

Spaces does not provide state locking, hence the pipeline concurrency group in §8.4.

### 15.2 App Platform Ingress

Implements the platform-routed rows of §6:

```yaml
ingress:
  rules:
    - match: { path: { prefix: /api/v1 } }
      component:
        name: war-api
        preserve_path_prefix: true      # forwarded as-is
    - match: { path: { prefix: /ui/default } }
      component:
        name: war-ui-default
        rewrite: /                      # strip prefix
    - match: { path: { prefix: / } }
      component:
        name: war-ui-default            # catch-all
```

The static component sets `catchall_document: index.html`, satisfying the platform half of §6.1.

App Platform serves the deployment on a `*.ondigitalocean.app` hostname, which sits behind Cloudflare and is not advertised.

**Image tag ownership.** Terraform creates and owns the app, but the API's image tag is owned by the deploy pipeline (§15.6). Terraform must therefore declare `lifecycle { ignore_changes = [...] }` on the service image tag, or every `terraform apply` would roll the running API back to whatever tag was current when the infrastructure was last applied. The app spec templates in `platform/{env}.yaml` carry an `${IMAGE_TAG}` placeholder for the pipeline to substitute.

**Concurrent deploys.** `war-api` and `war-ui-default` are separate repos deploying components of the *same* app, and GitHub concurrency groups do not span repositories. App Platform queues concurrent deployment requests, so this is safe in practice, but a UI deploy landing mid-API-deploy will briefly deploy a spec the API pipeline is still updating. Acceptable at current cadence; revisit if deploy frequency rises.

**Bootstrap image.** The placeholder `service.image` Terraform creates the app with must be a real DOCR image that starts and passes App Platform's health check with zero configuration — it cannot be `war-api`'s real image, which requires `DATABASE_URL`, `JWT_SECRET`, and the rest of §9's secrets to even boot and exits non-zero without them, failing the App Platform deployment `digitalocean_app` waits on and so failing `terraform apply` itself (confirmed: pinning it to a real, working `war-api` commit still 500s this way — `DeployContainerExitNonZero`). A public Docker Hub image was tried first, on the theory that any registry-agnostic image sidesteps needing something already pushed to `terraform/shared`'s registry — also rejected outright ("Image does not exist or is private") even for a real public image, a known limitation of the provider/DOCKER_HUB combination, not fixable by picking a different image. `bootstrap/Dockerfile` is what satisfies both constraints at once: a trivial `busybox httpd` image, built and pushed straight into DOCR as `war-api:bootstrap` by the one-off `push-bootstrap-image.yml` workflow (`workflow_dispatch`, not part of any deploy pipeline — rerun manually only if that tag is ever pruned). It is discarded the moment `platform/{env}.yaml` deploys for real, same as any placeholder would be.

**Ingress hostname: URL, not a bare hostname.** `module.edge`'s `cloudflare_record.apex` and `module.scheduler`'s Worker both need the app's `*.ondigitalocean.app` address, read via `default_ingress`. Despite `module.compute.app_default_host`'s own doc comment (now corrected), `default_ingress` is the app's full `https://...` URL, not a bare hostname — a `cloudflare_record` CNAME's `content` must be a bare hostname, so using it unmodified fails outright ("Content for CNAME record is invalid"), and prepending another `https://` for `module.scheduler`'s `api_origin` would have double-scheme'd it instead. `envs/{env}/main.tf` applies `trimprefix(..., "https://")` for the CNAME and passes the URL through unmodified for `api_origin`. Separately, right after `digitalocean_app.war` finishes creating, the API can still report "No active deployment found for app" — a real, if so-far-unconfirmed-to-matter-on-its-own, eventual-consistency window — so `envs/{env}/main.tf` also re-reads the app through `data "digitalocean_app" "war"`, gated on a `time_sleep.app_ingress` (30s, gated on `module.compute`), rather than trusting `digitalocean_app.war`'s own creation-time read; `module.edge` and `module.scheduler` consume the data source's `default_ingress`, not the module output. `module.compute.app_default_host` itself is unchanged and still used wherever neither concern applies.

### 15.3 Migrations Hook

The §10 pre-deploy hook is an App Platform `job` with `kind: PRE_DEPLOY`, sharing the API's image.

### 15.4 Scheduler

**App Platform jobs are deploy-lifecycle only** (`PRE_DEPLOY`, `POST_DEPLOY`, `FAILED_DEPLOY`) and provide no cron scheduling, so the §12 scheduler role is filled at the edge by **Cloudflare Workers Cron Triggers**:

```toml
# edge/scheduled-tasks — wrangler config
[triggers]
crons = ["0 3 * * *"]   # 03:00 UTC daily — close-expired-wars
```

```js
// edge/scheduled-tasks.js
export default {
  async scheduled(event, env, ctx) {
    const res = await fetch(`${env.API_BASE_URL}/api/v1/internal/close-expired-wars`, {
      method: 'POST',
      headers: { 'X-Internal-Token': env.INTERNAL_TASK_TOKEN },
    })
    if (!res.ok) throw new Error(`close-expired-wars failed: ${res.status}`)
  },
}
```

The Worker calls the API through its origin hostname, bypassing the §6 edge block on `/api/v1/internal/*`. Cron Trigger invocations and failures are visible in edge analytics, satisfying the §13 scheduled-task-failure row.

**Alternative if the edge is dropped:** a GitHub Actions workflow on `schedule:` hitting the same endpoint. Adequate for nightly housekeeping, with the caveat that scheduled workflows can be delayed or skipped under platform load — acceptable only because §12.1 holds.

### 15.5 Edge Configuration

- `/media/*` → Cloudflare **Worker** route running `edge/media-router.js`; `MEDIA_CDN_ORIGIN` binds to the `war-media-{env}` Spaces CDN hostname. Not an Origin Rule: redirecting to a different origin's hostname needs that rule type's Host Header override, which requires a paid Cloudflare plan; fetching the CDN's own hostname directly needs no such override. The Worker fetches with `cf: { cacheEverything: true, cacheTtl: 31536000 }`, which (per Cloudflare's documented precedence) overrides Cache Rules for this path — the deliberate mechanism for the "cache aggressively" requirement in §7, and one that does not depend on the origin actually sending a long-lived `Cache-Control`. That matters because §11 claims objects are written with one and, as of this writing, `war-api/src/contestants/storage.ts`'s `PutObjectCommand` does not set one — a real gap between spec and code, tracked there, not fixed by this Worker's own fixed TTL. Requires `compatibility_date >= 2025-04-02` on the script for the cache override to take effect.
- `/ui/*` (excluding `/ui/default/*`) → Cloudflare **Worker** route running `edge/ui-router.js`; `STORAGE_CDN_ORIGIN` binds to the single `war-ui-custom-{env}` Spaces CDN hostname
- `/api/v1/internal/*` → Cloudflare **WAF custom rule**, action `block`
- All other paths proxy to the App Platform hostname
- Cache purge via `POST /zones/{zone}/purge_cache` with explicit file URLs

### 15.6 Pipeline Commands

| §8 stage | Command |
|---|---|
| push image to container registry | `doctl registry login && docker push registry.digitalocean.com/war/war-api:{sha}` |
| trigger platform deployment (API) | `doctl apps update <app-id> --spec <rendered> --wait` |
| trigger platform deployment (static) | `doctl apps create-deployment <app-id> --wait` |
| sync to object storage | `aws s3 sync dist/ s3://war-ui-custom-{env}/{slug}/ --endpoint-url https://nyc3.digitaloceanspaces.com` |
| purge edge cache | `curl -X POST .../zones/$CLOUDFLARE_ZONE_ID/purge_cache -d '{"files":[...]}'` |

The API deploy uses `apps update` rather than `create-deployment` because it must pin a specific image tag: `platform/{env}.yaml` contains an `${IMAGE_TAG}` placeholder that the pipeline substitutes with the commit SHA. This is what makes staging→production a **promotion of the exact validated image** rather than a rebuild. Static components are built from source by the platform and need no tag, so `create-deployment` suffices.

`--wait` is required on both. It is what makes a failed pre-deploy migration (§10) fail the pipeline stage.

### 15.7 CI/CD Credential Names

Every pipeline in this repository reads these from this repository's own secret store, so the union of all of them is configured once, here. `ui-custom.yml` is the one exception: a reusable workflow's `secrets.*`/`vars.*` resolve against the **calling** repository, so each external `war-ui-{slug}` repo needs its own copy of the credentials that workflow uses, even though the workflow file itself lives here.

**In `war-infra`** (its own `infra.yml` runs directly here, not as a called workflow):

- `DIGITALOCEAN_ACCESS_TOKEN` — `doctl` auth, Terraform provider, registry login
- `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY` — object storage sync + Terraform backend
- `CLOUDFLARE_API_TOKEN` — DNS/rules management, Worker deployment, cache purge
- `INTERNAL_TASK_TOKEN` — the *only* §9 application secret Terraform actually consumes, passed as `TF_VAR_internal_task_token` to the scheduler module (the Worker cron job needs it to call the internal endpoint). None of the other §9 secrets are Terraform inputs — see below.

`CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_ACCOUNT_ID` are not secrets — they're bare identifiers with no access implications on their own (both visible in the Cloudflare dashboard and API responses), so they're repository variables instead, not secrets:

| Variable | Description |
|---|---|
| `CLOUDFLARE_ZONE_ID` | Zone id for the domain; used for DNS/rules management, Worker deployment, cache purge |
| `CLOUDFLARE_ACCOUNT_ID` | Account id; required by the edge and scheduler modules (Workers script/route/cron ownership) |

**In `war-api`** (its `api.yml`-called deploy jobs render `platform/{env}.yaml` via `envsubst`; see §9):

- `JWT_SECRET`, `INTERNAL_TASK_TOKEN`, `GOOGLE_CLIENT_SECRET` — substituted straight into the rendered app spec at deploy time, never Terraform inputs
- `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY` — same Spaces credentials as above, substituted into the spec's `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` env keys (the app reads S3-style names; see §9)
- `GOOGLE_CLIENT_ID` is a repository **variable** here (not a secret — see §9), substituted the same way

`INTERNAL_TASK_TOKEN` therefore exists as a secret in *both* repos, holding the same value, for two different consumers (the scheduler Worker in `war-infra`, the running API container reached via `war-api`'s deploy).

**Per-environment GitHub Environment variables** (environment-scoped, so `staging` and `production` resolve the same name to different values):

| Variable | Description |
|---|---|
| `DO_APP_ID` | App Platform app id for that environment |
| `PUBLIC_BASE_URL` | `https://staging.war.tmad.dev` or `https://war.tmad.dev`; used for smoke tests and cache purge |

**Approval gates** are GitHub Environment protection rules — a required reviewer on the `production` environment. They are deliberately not steps inside any workflow file, so the gate cannot be bypassed by editing a pipeline.

### 15.8 Platform Alert Rules

App Platform alert types backing the §13 platform-metrics rows: `CPU_UTILIZATION`, `MEM_UTILIZATION`, `RESTART_COUNT`, `DEPLOYMENT_FAILED`, `DOMAIN_FAILED`.

App Platform exposes no native 5xx-rate or latency-percentile alerting; those two §13 rows are satisfied by Cloudflare Analytics and the log vendor respectively.

---

## 16. Cost Baseline

Approximate monthly cost for staging + production at low traffic. Indicative only; revisit before launch.

| Item | Staging | Production |
|---|---|---|
| Application platform — API service | ~$5 | ~$12–29 |
| Application platform — static site | $0–3 | $0–3 |
| Managed PostgreSQL | ~$15 (single node) | ~$30–60 (with standby) |
| Object storage (250GB + 1TB transfer, CDN included) | shared ~$5 | shared |
| Container registry | shared ~$5 | shared |
| Edge (DNS, TLS, CDN, WAF, rate limiting, functions, cron) | $0 | $0 |
| Error tracking + log aggregation | $0–30 combined | |
| **Total** | **≈ $75–110/mo** | |

Egress beyond the bundled storage allowance is billed at roughly $0.01/GB. Image delivery is the dominant traffic driver, so image sizing has a direct and material effect on this figure.

Custom UIs add no fixed cost: they share one bucket and one origin (§5.5), so the marginal cost of a new slug is its stored bytes and its traffic.

---

## 17. Out of Scope (v1)

- Multi-region deployment
- Canary deploys (rolling zero-downtime replacement only; no traffic splitting)
- Automated rollback on smoke test failure (manual rollback via runbook)
- Dedicated secrets manager with rotation and audit (§9.1)
- Autoscaling (fixed instance counts; scale manually)
- Read replicas
- Cost alerting / budget alarms
- Per-PR preview environments
- Scheduled tasks beyond War expiry reconciliation (§12)

---

## 18. Provider Rationale

### 18.1 Why DigitalOcean

- **Routing maps natively.** App Platform's path-based ingress and catch-all document express §6 directly. The AWS equivalent (CloudFront behaviours + OAC + bucket policies + ALB + target groups + VPC + security groups) is roughly 800–1500 lines of Terraform for the same behaviour.
- **No plumbing tax.** No load balancer charge, no NAT gateway, and no per-secret fee. On AWS these three accounted for over half the idle spend across two environments.
- **Egress economics.** Bundled transfer with ~$0.01/GB overage, against ~$0.09/GB past CloudFront's free tier. For an image-heavy voting platform this is the dominant long-run cost difference.
- **Better deploys than previously specified.** v1.0 listed blue/green as out of scope and accepted replacement deploys; rolling zero-downtime deploys with health checks are standard here.
- **Bundled connection pooler.** §13 monitors pool utilisation — the pooler is a managed resource rather than something to operate.

### 18.2 What was traded away

- **Observability.** CloudWatch's 5xx-rate and p99 alerting have no native equivalent. §13 now depends on edge analytics, a log vendor, and error tracking. This is the single largest capability given up and the one place the migration *adds* a dependency rather than removing one.
- **Scheduling.** EventBridge would have covered §12 natively. App Platform has no cron primitive, so the scheduler role moved to the edge (§15.4).
- **Secrets management.** Secrets Manager offered versioning, rotation, and audit; the platform offers encryption at rest. See §9.1.
- **IAM granularity.** The access model is substantially coarser; CI/CD tokens carry broader authority than an equivalent AWS deploy role.
- **Adjacent services.** The deferred vote-tamper-detection analytics (`war-api-spec.md` §9) would have used SQS/Lambda/Athena. There are no comparable primitives here; that work will need external services.
- **Region count.** ~9 datacenters against AWS's ~34, mitigated by the edge for all cacheable traffic.

**Render** was evaluated as an alternative. It offers per-PR preview environments (including preview databases), which DigitalOcean does not, and native cron jobs, which would have covered §12 without the edge. It was not selected because it has no object storage — a hard requirement per §11 — and because its blueprint model places infrastructure configuration in the application repos, against the centralisation principle in §1.

### 18.3 Decisions made during migration

**Custom UIs moved from one bucket-origin-behaviour set per slug to a single shared bucket behind a single origin** (§5.5). The per-slug model makes every registration an infrastructure change, and on a component-routed platform it also consumes a per-deployment component budget and forces a full redeploy. Since custom UIs are unbounded by design, that cost grows without limit. The shared-bucket model removes per-slug infrastructure entirely — registration becomes a database row plus a file upload — at the cost of requiring the §6.1 edge function for SPA fallback. This change is provider-independent and would have been worth making on AWS.

---

## 19. Gherkin Acceptance Tests

These assert observable behaviour only and contain no vendor names; they remain valid across a provider change.

```gherkin
Feature: Routing

  Scenario: API requests are routed to the API service
    When a request is made to /api/v1/wars
    Then the request is forwarded to the war-api service
    And the path is preserved without rewriting
    And the response is JSON

  Scenario: Default UI is served for unmatched paths
    When a request is made to /some/unknown/path
    Then index.html from the default UI is returned
    And the HTTP status is 200

  Scenario: Custom UI slug is routed to the shared bucket
    Given a registered slug "miss-universe-2026"
    When a request is made to /ui/miss-universe-2026/
    Then index.html is returned from the shared custom UI bucket under that slug's prefix

  Scenario: SPA deep links into the default UI return index.html
    Given the default UI is deployed
    When a request is made to /wars/some-war-id/vote
    Then index.html is returned with HTTP 200
    And the client-side router handles the route

  Scenario: SPA deep links into a custom UI return index.html with status 200
    Given a registered slug "miss-universe-2026"
    When a request is made to /ui/miss-universe-2026/rankings
    And no object exists at that key in storage
    Then that slug's index.html is returned
    And the HTTP status is 200

  Scenario: Two custom UIs are served from the same origin
    Given registered slugs "miss-universe-2026" and "best-pizza-nyc"
    When requests are made to /ui/miss-universe-2026/ and /ui/best-pizza-nyc/
    Then each returns its own bundle
    And both were served from a single storage origin

  Scenario: Registering a new slug requires no infrastructure change
    Given a new custom UI bundle for slug "best-pizza-nyc"
    When the bundle is uploaded under that slug's prefix
    And a ui_registrations row is inserted
    Then /ui/best-pizza-nyc/ serves that bundle
    And no infrastructure apply was required
    And no new bucket or origin was created
    And no existing component was redeployed

Feature: Scheduled Tasks

  Scenario: Expired Wars are closed by the nightly task
    Given an active War whose ends_at passed six hours ago
    When the close-expired-wars task runs
    Then the War's stored status becomes "closed"

  Scenario: Voting is rejected at expiry regardless of the task
    Given an active War whose ends_at passed one minute ago
    And the close-expired-wars task has not yet run
    When a voter casts a vote
    Then the response status is 403
    And the War is reported as closed

  Scenario: The task is idempotent
    Given the close-expired-wars task has already run successfully
    When it runs again with no newly expired Wars
    Then no War records are modified
    And the task reports success

  Scenario: Internal task endpoints reject unauthenticated callers
    When a request is made to /api/v1/internal/close-expired-wars without a valid internal token
    Then the request is rejected
    And no War records are modified

  Scenario: Internal task endpoints are not reachable from the public internet
    When an external client requests /api/v1/internal/close-expired-wars
    Then the request is blocked at the edge
    And it never reaches the API service

  Scenario: Repeated task failure raises an alert
    Given the close-expired-wars task has failed on two consecutive scheduled runs
    Then an alert is raised
    And the platform continues to reject votes on expired Wars

Feature: CI/CD Pipelines

  Scenario: API deploy pipeline runs all stages on merge to master
    Given a merged PR in war-api
    When the pipeline triggers
    Then lint, test, and build stages all pass
    And the image is pushed to the container registry
    And a deployment is triggered for staging
    And smoke tests pass before the production gate is reached

  Scenario: A failed migration aborts the deployment
    Given a migration that exits non-zero
    When the pre-deploy hook runs during a deployment
    Then the deployment is aborted
    And the previous revision continues serving traffic

  Scenario: Custom UI pipeline blocks on missing required template
    Given a war-ui-{slug} repo missing vote-mode.mustache
    When the pipeline runs the template-check stage
    Then the pipeline fails
    And no deployment occurs

  Scenario: Custom UI pipeline blocks on bundle size exceeded
    Given a war-ui-{slug} repo with a built output of 3MB
    When the pipeline runs the size-check stage
    Then the pipeline fails with a size error
    And no deployment occurs

  Scenario: Infrastructure changes require manual approval for production
    Given an infrastructure change merged to war-infra master
    When the pipeline reaches the apply-prod stage
    Then it pauses for manual approval
    And only proceeds after a team member approves

  Scenario: Concurrent infra applies to one environment are serialised
    Given an infrastructure apply is running for production
    When a second push to master triggers another apply
    Then the second run queues behind the first
    And neither run is cancelled

Feature: Concurrency Group Isolation

  Scenario: A concurrency group name shared by two different pipelines is flagged
    Given two different workflow files that each declare the same literal
      concurrency group name
    When the repository's concurrency groups are checked
    Then the check reports a violation naming both files and the shared group

  Scenario: A pipeline serialising its own jobs is not flagged
    Given a single workflow file whose own jobs deliberately share one
      concurrency group, as the infra pipeline's plan/apply job pairs do
    When the repository's concurrency groups are checked
    Then no violation is reported for that file

  Scenario: The api and ui-default pipelines no longer share a group
    Given the api and ui-default pipelines as delivered by this change
    When their staging and production concurrency groups are inspected
    Then all four group names are distinct
    And none of them is shared with any other workflow file

Feature: Secrets & Config

  Scenario: Secrets are never stored in repos
    Given any application repo
    When the repo is scanned for secret patterns
    Then no secrets, API keys, or credentials are found

  Scenario: API receives correct env vars at runtime
    Given the war-api service starts in staging
    When it initialises
    Then DATABASE_URL, JWT_SECRET, and OAuth credentials are available
    And DATABASE_URL points at the pooled connection, not the direct one

  Scenario: Infrastructure plan output redacts secret values
    Given a change to a secret environment variable
    When the plan runs in CI
    Then the plan output shows the value as sensitive
    And the cleartext value does not appear in pipeline logs

Feature: Data Protection

  Scenario: The database is not reachable from the public internet
    Given the managed PostgreSQL cluster is provisioned
    When a connection is attempted from an address outside the allowed sources
    Then the connection is refused

Feature: Edge Protection

  Scenario: Auth endpoints are rate limited at the edge
    Given a client issuing requests to /api/v1/auth/* above the configured threshold
    When the requests reach the edge
    Then excess requests are rejected before reaching the origin
    And the rate limit event is recorded in edge analytics
```

---

## 20. First Deploy — Lessons Learned

Retrospective notes from getting the first real end-to-end deploy working (staging and production both, this repo plus `war-api` and `war-ui-default`). Platform-generic lessons (DigitalOcean, Cloudflare, GitHub Actions behavior that would apply to any project using them) live in this Claude installation's global skills, not here. What follows is specific to *this* project — decisions, gaps, and history someone working on `war` specifically needs to know that a generic platform skill wouldn't tell them.

### 20.1 Everything was wired before anything was proven

The secrets, variables, Terraform modules, and CI/CD pipelines across all three repos were fully built out before a single real deploy was attempted end-to-end. The result: roughly a dozen distinct bugs surfaced all at once, in sequence, only when the first real `Deploy → Staging` run actually tried to go live — each one blocking the next from ever being reached. Several of them (§20.2, §20.3) had been sitting there the whole time; nothing before that point would have caught them, because nothing before that point actually deployed anything real.

**For the next environment or component added to this project**: get one real deploy fully working end-to-end — even a trivial one — before building out the surrounding automation around it. A green CI pipeline that has never actually deployed anything proves much less than it looks like it proves.

### 20.2 `war-ui-default` had no real application at first deploy — resolved

At first deploy, `war-ui-default`'s deployed app was a placeholder (`src/main.ts` — a single "War / Coming soon." page), existing only so App Platform's `static_sites` build step would succeed (the API and UI are components of one App Platform app deployed atomically, §5.2). **This is no longer current** — see §20.5: the placeholder was replaced by the real Core Voting Loop implementation, live in both staging and production as of 2026-08-31.

### 20.3 `war-api`'s `master` branch had a 10-year-old, unrelated history

Before this deploy effort, `war-api`'s actual default branch (`master`, what GitHub Actions triggers on) held a single decade-old commit of unrelated legacy `.NET` projects — completely disconnected from where the real Fastify/TypeScript implementation had been developed (an `new-master` branch with unrelated git history). No CI/CD had ever run against real application code as a result; every push to the real implementation's branch was invisible to the pipeline.

This was resolved with a merge that preserves both histories (`git log` on `master` shows a two-parent merge commit whose tree matches `new-master` exactly) rather than discarding the old branch's history outright. If `war-api`'s git history looks unusual — a merge commit with a completely unrelated first-parent history — this is why, and it's expected, not a sign of a bad merge.

### 20.4 `DO_APP_ID` is a manual step after any from-scratch environment apply

Terraform creates the DigitalOcean App (`terraform apply` outputs `app_id`), but nothing pushes that ID anywhere automatically. The deploy pipelines read it from a GitHub Actions **Environment variable** (`DO_APP_ID`, scoped per environment — `staging`/`production`), which has to be set by hand after `app_id` first exists for that environment:

```bash
gh variable set DO_APP_ID -R tadams1138/war -e <staging|production> --body "<app_id>"
```

One value per environment covers both pipelines: there is a single app per environment holding the API service and the static site alike, so `api.yml` and `ui-default.yml` deploy to the same id. Before the consolidation (§20.6) this same value had to be set separately in each repo, and the two could silently disagree.

This is easy to forget precisely because it's a one-time step per environment, done long after the routine of "push code, pipeline deploys it" is established — the failure mode when it's missing (`PUT https://api.digitalocean.com/v2/apps/: 405`, an empty app ID in the URL) doesn't obviously point at a missing GitHub variable. Needed again for any *new* environment this project ever adds beyond staging/production.

### 20.5 Core Voting Loop slice shipped (2026-08-31) — and the Google OAuth deployment-config bug family

The first real vertical slice — Home, Login/auth, WarDetail, VoteMode (image mode only), `api/client.ts`, plus `war-api`'s `openapi.json` contract, `contestant_count`, and a typed vote-403 discriminator — is live in both staging and production for both `war-api` and `war-ui-default`, verified with a real interactive Google login, not just automated tests. `war-ui-default`'s Implementation Status (its own spec, §12) and `war-api-spec.md` §15 both reflect current scope; check those before assuming what's built versus still spec-only.

**The Google OAuth login was broken on every real deployment for four consecutive rounds after the slice otherwise worked**, each caught only by an actual human trying to log in, not by the (green, passing) automated suite. The generic, reusable lessons from all four rounds — redirect-URI single-sourcing, `openid-client` v6's `iss`/RFC 9207 requirement, the OAuth `error` query parameter, error-boundary scoping — are written up in this Claude installation's global `google-oauth` skill, not repeated here. What's specific to *this* project:

- **This architecture serves the API and the default UI from one shared domain per environment** (`staging.war.tmad.dev`, `war.tmad.dev` — §3, §5). `PUBLIC_BASE_URL` (war-api's own base URL), `UI_ORIGINS` (CORS + the OAuth callback's post-login redirect target), and the derived Google OAuth `redirect_uri` are consequently all the *same* domain value in this project specifically — a project without this shared-domain design would need to treat them as genuinely independent per-environment values.
- Four PRs, in order, on `war-api`: **#10** (redirect URI never deployed, silently defaulted to `localhost:3000`), **#11** (the `iss`/RFC 9207 fix, plus closing a second redirect-URI divergence the first fix's initial pass reintroduced), **#12** (`UI_ORIGINS` — found by auditing every other `localhost`-defaulting config field immediately after #10, rather than waiting for a third user report), **#13** (the callback's failure-response contract — 403/400/502 instead of a leaked library error code). Each went through the project's full spec → implement → review → apply cycle; each review caught at least one real, live-bug-shaped gap the implementation had missed.
- `assertProductionConfig` in `war-api/src/config.ts` is the concrete result of this: every deployment-required, non-secret config value (`apiBaseUrl`, `uiOrigins`) now has a fail-fast boot check, added reactively one bug at a time — the `google-oauth` skill's "meta-lesson" section is the standing instruction to do this audit proactively for the *next* project, not reactively.
- **Deferred, not forgotten**: the OAuth callback's failure responses are still raw JSON shown mid-redirect-chain in a real browser (functionally correct, UX-rough) — a redirect-based failure UX (e.g. `/login?error=...`) was explicitly scoped out of PR #13 as a larger, cross-repo change needing `war-ui-default` to have somewhere to send the user. Pick this up before or alongside whatever `war-ui-default` slice next touches the Login page.

### 20.6 The three repos were consolidated into one (2026-08-31)

`war-api`, `war-ui-default`, and `war-infra` were separate GitHub repositories until this
point. They are now directories in a single repository, `tadams1138/war`, with all three
histories preserved via subtree merges — `git log` shows three unrelated roots, which is
expected, not a bad merge. The old repositories are retained, unmodified, as the rollback.

**Why.** The split was costing more than it returned, and had been for a while:

- **Cross-repo changes were the norm, not the exception.** The Core Voting Loop slice alone
  produced three: `contestant_count` and the vote-`403` `reason` discriminator were `war-api`
  changes discovered mid-implementation in `war-ui-default` and shipped as separate preceding
  PRs; §20.5's deferred OAuth failure UX is deferred *because* it spans two repos; and the
  spec status updates for the whole slice landed as their own follow-up commit here. Each was
  an atomicity loss that a single repository removes outright.
- **The specs never really wanted to be split.** All five describe one platform and reference
  each other constantly. `war-api` had tried keeping a repo-local copy and it was folded back
  precisely because two hand-maintained prose descriptions of one behavior drift. They now sit
  at the repository root, equally reachable from every project, with their relative links
  between documents working again.
- **`@master` was monorepo coupling without monorepo safety.** All four caller workflows
  pinned `tadams1138/war-infra/...@master`, so any edit here reached both applications
  immediately, untested against either — and §4's rerun hazard existed entirely because of
  that indirection.
- **The two applications already deployed to one App Platform app.** `DO_APP_ID` was
  *identical* in both repos for a given environment; `platform/{env}.yaml` has always been a
  single spec holding both the `war-api` service and the `war-ui-default` static site. The
  repositories were separate; the deployment never was.
- The development pipeline this project uses resolves its root with
  `git rev-parse --show-toplevel`, so from the directory that merely *contained* the three
  checkouts it could not run at all.

**What changed mechanically.** Path-filtered `push`/`pull_request` triggers replace the
`workflow_call` + caller-workflow indirection; deploy jobs gate on
`github.event_name != 'pull_request'`. The cross-repo `actions/checkout` of `war-infra` in
both deploy pipelines is gone, since `platform/{env}.yaml` and `scripts/smoke-test.sh` are
now local paths. `static_sites[].github.repo` in both platform specs points at
`tadams1138/war` with `source_dir: war-ui-default` — that field was the only binding in the
entire stack that named a repository, since the API deploys a DOCR image and has none.

**What this newly requires, and is easy to miss:**

- **DigitalOcean's GitHub app must be authorised on `tadams1138/war`** before a spec update
  applies, or the static-site build cannot fetch source. This is the same class of one-time,
  easily-forgotten manual step as §20.4's `DO_APP_ID`.
- **Both deploy pipelines now target the same app from the same repository**, and one commit
  can trigger both. `doctl apps update --spec` (api) and `doctl apps create-deployment`
  (ui-default) racing on one app is a real collision, so both deploy jobs share a
  `deploy-<env>` concurrency group. Any future pipeline touching this app must join it.
  **No longer current — see §20.8.** The shared group caused a worse, silent defect (a
  gate-blocked production deploy evicted by the sibling pipeline) and has been replaced by
  one group per pipeline per environment. The same-app race this bullet describes is
  knowingly reopened, not fixed, by that change — §20.8 explains why that trade is correct.
- **Secrets do not transfer between repositories.** GitHub's API never returns a secret's
  value, so all eight had to be re-entered by hand. Five were re-copyable from a provider
  console; `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, and `INTERNAL_TASK_TOKEN` (the last of which
  has since been removed as dead config -- see §20.7) are self-generated
  and recoverable from nowhere — App Platform returns `type: SECRET` values as `EV[1:…]`
  ciphertext. Rotating `INTERNAL_TASK_TOKEN` in particular requires running *both* the infra
  pipeline (which sets it on the scheduler Worker) and the api pipeline (which substitutes it
  into the app spec), or `close-expired-wars` starts returning `401` silently.
- **Environment protection is per-repository.** The `production` required-reviewer gate is
  configuration, not code, and does not come along with the variables — a new repository
  starts with no gate and nothing indicating one is missing.

**Deliberately not done in this round.** The two deploy pipelines are still separate even
though the API's `--spec` update already redeploys the static site, which makes
`ui-default.yml`'s deploy step largely redundant. Unifying them is a pipeline redesign
rather than part of the move, and is worth its own round.

### 20.7 `REFRESH_TOKEN_SECRET` was deployed to production and read by nothing

Found immediately after §20.6's consolidation, while working out which secrets actually had to
be rotated. `REFRESH_TOKEN_SECRET` was a repository secret, substituted by `envsubst` into
`platform/{env}.yaml`, and delivered to the running container as a `type: SECRET` environment
variable in both environments — and `war-api` never read it. It appears nowhere in `src/`.

§9's table described it as the "Refresh token signing key", but refresh tokens are not signed.
`war-api-spec.md` §4 has always specified them as opaque values "stored server-side (hashed,
never in plaintext) for revocation", and `src/auth/refreshTokens.ts` implements exactly that:
`randomBytes(32).toString('base64url')` for the token, `sha256` of it for the stored row. There
is no key in the scheme, so there was nothing for a signing key to do. The implementation was
correct and this document was wrong — not the other way round — so the fix was to delete the
variable and the row, not to invent a use for it.

**This is §20.5's bug family with the sign flipped.** There, `PUBLIC_BASE_URL` was needed by the
application and never read from the environment, so the app silently fell back to a localhost
default and OAuth broke in production. Here a value was faithfully plumbed end to end and read
by nobody. Both are the same underlying defect — no check that a deployment variable and its
consumer actually meet — and only the first one had visible symptoms. The second sat in
production indefinitely, looking exactly like working configuration.

`assertProductionConfig` (`war-api/src/config.ts`) cannot catch this class: it validates the
config object the application builds, and a variable the application never reads never becomes
part of that object. Catching set-but-unread would mean comparing the deployed spec's env keys
against what `loadConfig` actually consumes — worth doing if this recurs, but one instance is
not yet a pattern worth building tooling for.

**Removed from:** both `platform/{env}.yaml` files, the two `envsubst` variable lists and two
`env:` blocks in `.github/workflows/api.yml`, and §9's secret table. The GitHub repository
secret itself can be deleted once a deploy carrying this change has reached both environments;
until then it is merely unreferenced. Note that the deleted env var was `type: SECRET`, so App
Platform will drop it from the running container on the next deploy — no restart-time surprise,
because nothing reads it.

### 20.8 Shared `deploy-{env}` concurrency groups silently evicted a gate-blocked production deploy

§20.6's shared `deploy-staging` / `deploy-production` concurrency groups — one pair, reused
verbatim by both `api.yml` and `ui-default.yml` — were meant to stop the two pipelines'
`doctl` calls from racing against the one App Platform app they both deploy. They caused a
worse defect instead.

`cancel-in-progress: false` protects a *running* job. It says nothing about a *pending* one,
and GitHub Actions retains exactly one pending run per concurrency group. A job waiting at a
`production` environment's required-reviewer gate is pending, not running — so when the
sibling pipeline's own deploy job entered the same group, GitHub evicted whichever job was
already queued there, silently: the run simply reads `cancelled`, with no failure
notification anywhere that distinguishes it from any other cancellation.

This happened to real commits, three times. Commit `9404ffe` — closing the `GET /wars`
visibility leak that returned every voter's `draft` and `invite_only` Wars to anonymous
callers, a live data exposure — reached its `Deploy → Production` gate on 2026-09-02 and sat
there awaiting approval, exactly as designed. On 2026-09-09 the navigation slice's
`ui-default.yml` run reached its own production gate, entered the shared `deploy-production`
group, and evicted it: `war-api`'s `Deploy → Production` shows `cancelled`, while its `CI`,
`Build image`, and `Deploy → Staging` all show success. `e5aabc7` and `d905cfc` were
cancelled the same way on 2026-09-01. **The security fix sat undeployed to production for
seven days, and nothing surfaced that fact** — a cancelled run and a successful one look
alike in the Actions UI, and no alert exists for "evicted by a sibling pipeline."

**Fix: one concurrency group per pipeline per environment — four groups, not two.**

| File | Job | Group |
|---|---|---|
| `api.yml` | `deploy-staging` | `deploy-staging-api` |
| `api.yml` | `deploy-production` | `deploy-production-api` |
| `ui-default.yml` | `deploy-staging` | `deploy-staging-ui` |
| `ui-default.yml` | `deploy-production` | `deploy-production-ui` |

Each group now only ever holds runs from its own workflow file, so a job parked at a gate
can only be evicted by a rerun of *its own* pipeline — the one case `cancel-in-progress:
false`'s own documentation already names and accepts.

**This knowingly reopens the race §20.6 introduced the shared group to close, and that is
the correct trade.** `api.yml`'s `doctl apps update --spec` and `ui-default.yml`'s `doctl
apps create-deployment` can again run concurrently against the same App Platform app if a
push happens to trigger both pipelines close together. §15.2 already named and accepted
exactly this risk, before the repos were even one: "App Platform queues concurrent
deployment requests, so this is safe in practice ... Acceptable at current cadence; revisit
if deploy frequency rises." This change restores that previously-accepted, bounded risk in
exchange for closing an unbounded one — an indefinite, silent loss of a production deploy is
strictly worse than a same-app race the platform's own request queueing already absorbs.
Revisit together with §15.2 if deploy frequency ever rises enough to make that queueing
insufficient.

**Why this must never be undone by "tidying."** All four groups carry identical settings
(`cancel-in-progress: false`) and near-identical names differing only by environment and
app — exactly the shape that invites a future "these are the same, let's merge them back"
pass. Each of the four `concurrency:` blocks must carry a comment recording, at minimum:
(1) that the group is deliberately not shared with the sibling pipeline's group for this
environment, (2) why — a shared group lets a job queued at an approval gate be silently
evicted by the other pipeline's job entering the same group, and (3) a pointer to this
section. Suggested wording, one block shown, the other three following the same shape with
`{env}` ∈ `{staging, production}`, `{app}` ∈ `{api, ui}`, and `{sibling}` the other of
`api.yml` / `ui-default.yml`:

    # Serializes reruns of THIS pipeline's own {env} deploy against itself.
    # Deliberately NOT shared with {sibling}'s {env} group, even though both
    # write to the same App Platform app: GitHub keeps only one *pending* run
    # per concurrency group, and a job queued at the production approval gate
    # is pending, not running — a shared group lets the other pipeline's job
    # evict it there, silently. That cancelled a live production security fix
    # (commit 9404ffe) for seven days. See specs/war-infra-spec.md §20.8.
    # Do not unify this with {sibling}'s group.
    concurrency:
      group: deploy-{env}-{app}
      cancel-in-progress: false

**Verification.** See §19, "Feature: Concurrency Group Isolation," and the
`.github/workflows/concurrency-groups.yml` guard it specifies: a static check over every
workflow file's declared `concurrency.group` values, failing the build the moment the same
literal name is ever declared by two different workflow files again. The guard's contract:

*Must catch:*
- The same literal `concurrency.group` string declared in the `concurrency:` block of two or
  more different workflow files, whether that block sits at a job's level or the workflow's
  top level — exactly the `deploy-staging` / `deploy-production` collision this section
  fixes.

*Must not flag:*
- The same group name repeated across two or more jobs within *one* workflow file —
  `infra.yml`'s own `terraform-shared`, `terraform-staging`, and `terraform-production`
  pairs are exactly this pattern already, and are correct as written; it exists because
  Terraform's state backend has no locking (§2.1) and needs its own plan/apply pair
  serialized against itself, which is an unrelated concern from the one this guard targets
- A workflow file with no `concurrency:` block at all — most jobs in this repository (`ci`,
  `build`, `validate`, and every `infra.yml` `plan-*` job) declare none
- Two group names that are merely similar but not byte-identical (e.g.
  `deploy-production-api` vs. `deploy-production-ui`)
- A group name containing a GitHub Actions expression (`${{ ... }}`) — the check compares
  the literal declared text without evaluating the expression. None of today's groups use
  one; a future group that wants deliberate, expression-based sharing across workflows is a
  decision for whoever adds it to make explicitly, not something for this guard to silently
  permit or silently block by trying to evaluate it

Recommended shape: a fifth workflow, `.github/workflows/concurrency-groups.yml`, triggered
on push, pull_request, and workflow_dispatch whenever anything under
`.github/workflows/**` changes — the same trigger shape `openapi-contract.yml` uses, and for
the same reason: the drift this catches is never caused by a change to one pipeline's file
alone, so scoping the trigger to a single workflow's own path would miss the other half of
the collision. It deploys nothing and needs no cloud credentials, so it can watch every
workflow file in the repository, including itself.

**What this guard cannot verify.** GitHub's "one pending run per concurrency group, and an
approval gate counts as pending" behavior is a platform fact, not something this repository
can execute and observe — reproducing it would mean staging a real approval gate and a real
concurrent run, which is exactly the expensive, flaky path §19 already avoids elsewhere for
comparable platform behavior (e.g. "Concurrent infra applies to one environment are
serialised," §19, which asserts a real but unautomated platform guarantee the same way).
This incident is that behavior's evidence; the guard's job is narrower and fully mechanical —
keep the configuration that depends on it from silently regressing.
