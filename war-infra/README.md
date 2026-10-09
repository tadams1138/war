# war-infra

Infrastructure-as-code for the War platform using Terraform, Cloudflare Workers, and DigitalOcean.

## Overview

This directory defines:
- **Cloud infrastructure** — compute, storage, databases, and edge configuration
- **Deployment pipelines** — automated environment promotion from staging to production
- **Operational tools** — local checkers and validators

Every infrastructure change is applied through the CI pipeline (`.github/workflows/infra.yml`), never manually. The pipeline validates, plans, and applies Terraform to staging automatically on merge, and requires manual approval to promote to production.

## Directory structure

| Directory | Purpose |
|-----------|---------|
| `terraform/` | Terraform modules and environment configurations |
| `platform/` | App Platform deployment specs (`.yaml`) — the source of truth for service configuration after bootstrap |
| `edge/` | Cloudflare Workers for routing, scheduled tasks, and custom UI dispatch |
| `bootstrap/` | Container image for initial database setup |
| `scripts/` | Operational scripts (smoke tests) |
| `tools/` | Local build-time checks and validators (e.g., concurrency-group uniqueness) |
| `specs/` | Gherkin feature files for infrastructure behavior |

## Environments

**Staging** (`staging.war.tmad.dev`)
- Single-node PostgreSQL database
- Auto-deployed on every merge to `master` via CI
- Used for integration testing before production promotion

**Production** (`war.tmad.dev`)
- PostgreSQL with automated standby and point-in-time recovery
- Requires manual approval gate in CI before deploy
- Production promotes the exact image/config that staging validated; never rebuilt

## Terraform structure

The `terraform/` directory contains:

- `shared/` — shared resources across all environments (none currently)
- `envs/staging/` and `envs/production/` — environment-specific Terraform roots
- `modules/`
  - `compute/` — App Platform application and its initial spec
  - `data/` — PostgreSQL database cluster with connection pooler
  - `storage/` — DigitalOcean Spaces buckets for media, custom UIs, and state
  - `edge/` — Cloudflare DNS, TLS, WAF rules, rate limiting, and Worker routes
  - `scheduler/` — Cloudflare cron triggers and Worker bindings

Each environment's `main.tf`:
1. Configures providers and remote state backend (Spaces S3-compatible)
2. Instantiates modules with environment-specific values (node size, counts, hostnames)
3. Handles async dependencies (e.g., waiting for App Platform ingress to be ready)

## App Platform deployment

The application deployment follows a two-stage model:

1. **Terraform bootstrap** — creates the App Platform app and outputs its ID (once per environment, manual step)
2. **Platform specs** (`platform/{env}.yaml`) — defines services, ingress rules, and environment variables after bootstrap

The `.yaml` files are the source of truth for the running app — Terraform creates with a placeholder image and then ignores spec changes (configured with `ignore_changes = [spec]`). This allows:
- Image tags to change on every deploy without terraform apply
- Secrets to be substituted at deploy time without storing them in state

Apply the spec to a running app:
```bash
IMAGE_TAG=<commit-sha> envsubst < platform/staging.yaml > /tmp/app.yaml
doctl apps update <app-id> --spec /tmp/app.yaml --wait
```

The deploy pipeline (`.github/workflows/api.yml`) automates this.

## Routing and Cloudflare Workers

Requests flow:

1. **Public hostname** → Cloudflare edge (DNS, TLS, WAF, rate limiting)
2. **Cloudflare Workers** dispatch to origin
   - `/api/v1/*` → App Platform API (prefix preserved)
   - `/ui/default/*` → App Platform static site (prefix stripped to `/`)
   - `/ui/{slug}/*` → Custom UI bucket (via `og-tags-router.js`)
   - `/media/*` → Media bucket (cached, prefix stripped)
3. **Internal endpoints** (`/api/v1/internal/*`) — blocked on public hostname, reachable only from scheduler
4. **Everything else** → Default UI shell (for SPA routing)

### Edge Workers

| Worker | Purpose |
|--------|---------|
| `ui-router.js` | Routes custom UI requests to shared bucket by slug, returning shell with 200 for SPA deep links |
| `og-tags-router.js` | Injects OG meta tags into War detail page for link previews |
| `media-router.js` | Caches and serves media, stripping the `/media/` prefix |
| `scheduled-tasks.js` | Invoked by Cloudflare cron; dispatches scheduled operations to internal API endpoints |

## Scheduled tasks

Only one task currently runs:

- **close-expired-wars** (nightly) — updates the `status` column for Wars past their `ends_at` date

Per spec, scheduled tasks are never authoritative — the API evaluates expiry lazily on every read/write. A failed task delays stored state convergence but does not break voting or ranking logic. The task is safe to run repeatedly and concurrently; up to 2 consecutive failures trigger an alert.

## Secrets and configuration

### Required GitHub Actions secrets

Stored per-repository in GitHub's secret store and injected into CI:

| Secret | Used by | Purpose |
|--------|---------|---------|
| `DIGITALOCEAN_ACCESS_TOKEN` | terraform, do CLI | DigitalOcean API access |
| `CLOUDFLARE_API_TOKEN` | terraform | Cloudflare API access |
| `SPACES_ACCESS_KEY_ID` | terraform state backend | DigitalOcean Spaces (S3-compatible) |
| `SPACES_SECRET_ACCESS_KEY` | terraform state backend | DigitalOcean Spaces (S3-compatible) |
| `INTERNAL_TASK_TOKEN` | terraform scheduler, API config | Secret token for internal endpoint authorization |
| `JWT_SECRET` | API config | Session token signing (substitute into platform spec) |
| `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`, `TWITTER_CLIENT_SECRET` | API config | OAuth provider client secrets |
| `DOCKERHUB_TOKEN` | API and bootstrap pipelines | Docker Hub access token for authenticated image pulls (avoids the anonymous rate limit on shared runners) |

### Required GitHub Actions variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `CLOUDFLARE_ZONE_ID` | terraform | Cloudflare DNS zone ID |
| `CLOUDFLARE_ACCOUNT_ID` | terraform, scheduler | Cloudflare account ID |
| `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, `FACEBOOK_CLIENT_ID`, `TWITTER_CLIENT_ID` | API config | OAuth provider client IDs |
| `PUBLIC_BASE_URL` | API config | The API's public base URL |
| `DO_APP_ID` | API deploy pipeline | App Platform app ID, set once per GitHub environment (staging, production) from Terraform's `app_id` output |
| `DOCKERHUB_USERNAME` | API and bootstrap pipelines | Docker Hub account that owns `DOCKERHUB_TOKEN` |

## Rate limiting configuration

The API's per-address rate limits (sign-in start and token refresh, spec §8.4) need the real client address, which depends on how many reverse-proxy hops sit in front of the API. The hop count is **not yet verified**, so `TRUST_PROXY_HOPS` is unset and those limits are **off**. Unset is deliberate: a wrong count would either throttle every client as one address or trust a spoofable header. The Cloudflare edge rule on `/auth/*` still applies.

To enable per-client rate limiting:
1. Measure the hop count for Cloudflare → App Platform ingress
2. Set the `TRUST_PROXY_HOPS` environment variable in `platform/{env}.yaml` to that count
3. The API will then extract the true client IP and apply per-client limits

## Local validation

Before pushing infrastructure changes:

```bash
# Check Terraform formatting
terraform fmt -check -recursive war-infra

# Validate each environment
terraform -chdir=war-infra/terraform/envs/staging init -backend=false
terraform -chdir=war-infra/terraform/envs/staging validate

terraform -chdir=war-infra/terraform/envs/production init -backend=false
terraform -chdir=war-infra/terraform/envs/production validate

# Run local concurrency-group checks
npm --prefix war-infra/tools/concurrency-groups run check
```

These mirror the validation steps in `.github/workflows/infra.yml`.

## Operational constraints

Known rules not visible in code, each learned through production incidents:

1. **Manual bootstrap step** — After `terraform apply`, the output includes the new App Platform app ID. This must be stored manually as the `DO_APP_ID` variable of that GitHub environment; the deploy pipelines read it from there.

2. **Unique concurrency groups** — Each deploy pipeline requires its own named serialization group per environment to prevent pending runs from being evicted by a sibling pipeline's new job. A build-time check fails if two pipelines share one.

3. **Placeholder image** — Terraform cannot bootstrap the app with the real API image (which requires secrets to boot). A placeholder image is pushed once; the API deploy replaces it.

4. **Platform spec ownership** — After bootstrap, changes to the app go in `platform/{env}.yaml`, not in the Terraform compute module. The module ignores spec changes by design; every terraform apply would otherwise roll back the running deployment.

5. **OAuth redirect URIs** — Provider redirect URIs (e.g., `https://staging.war.tmad.dev/auth/google/callback`) must be registered manually with each OAuth provider, per environment. Nothing in the pipeline does this; sign-in fails silently if missing.

## Smoke tests

Both API and UI deploy pipelines run smoke tests after deployment to catch deploy-time failures before promoting to production:

- **API smoke test** — POST to internal endpoints, verify basic health
- **UI smoke test** — Load the app, verify key pages render

See `scripts/smoke-test.sh` and pipeline definitions in `.github/workflows/`.

## Further reading

- `war-spec.md` (§12) — infrastructure specification and requirements
- `CLAUDE.md` — build and test commands
- `.github/workflows/infra.yml` — Terraform pipeline (validate, plan, apply)
- `.github/workflows/api.yml` — API deploy pipeline (build, push, spec apply)
