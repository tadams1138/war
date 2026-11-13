# War

A web-first social voting platform. Authenticated users rank contestants through head-to-head
binary matchups: a creator builds a War (a category, a set of contestants with images and
bios, an end date), publishes it, and voters pick a winner in one matchup after another until
the War's rankings emerge. Sign-in is via Google, Microsoft, Facebook, or Twitter/X; there is
a Moderator/Admin staff layer with abuse reporting, a moderation log, and a War-creation kill
switch.

**Live:** [war.tmad.dev](https://war.tmad.dev) (production) and
[staging.war.tmad.dev](https://staging.war.tmad.dev) (staging). Signing in needs an account
with Google, Microsoft or Twitter/X (the Facebook button is hidden until Meta business
verification completes). To click through the UI without any backend, run it in
[mock mode](#try-the-ui-with-no-backend).

The project was developed with an AI-assisted TDD workflow; [`AGENTS.md`](AGENTS.md) holds those
working conventions.

## Architecture

The platform is three projects and one specification. [`SPEC.md`](SPEC.md) says what
the system does, in implementation-agnostic terms; where a test and the spec disagree, the
spec wins. [`war-api/`](war-api) is the backend REST API, [`war-ui-default/`](war-ui-default)
the default web frontend (a React single-page app) and [`war-infra/`](war-infra) the
Terraform, App Platform specs, Cloudflare Workers and deploy scripts. The technologies are in
[Tech stack](#tech-stack).

A brand-specific custom UI (see TODO #1) is its own repository, not a directory here;
its registry, hosting and reusable pipeline remain planned in [TODO #1](TODO/1-custom-ui-registry-and-shared-runtime.md).

```mermaid
flowchart LR
  B[Browser] --> CF["Cloudflare edge<br/>DNS, WAF, rate limit, cache rules"]
  CF -->|"/api/v1/*"| API["war-api<br/>App Platform service"]
  CF -->|"/* (everything else)"| UI["war-ui-default Worker<br/>static assets, and link-preview<br/>tags on /wars/id"]
  CF -->|"/media/*"| MEDIA["media-router Worker<br/>edge cache"]
  MEDIA -->|"MEDIA_BUCKET binding"| R2["Private R2<br/>image storage"]
  API --> PG[("Managed PostgreSQL<br/>pooled connection")]
  API -->|"S3 API"| R2
  CRON["Cloudflare cron Worker"] -->|"POST /internal/close-expired-wars"| API
```

Staging and production are each one DigitalOcean App Platform app serving the API image, with
the default UI served by a Cloudflare Worker with static assets on the same domain. The layout of `war-infra/` and how it is deployed and
operated are under [Deployment and operations](#deployment-and-operations).

## Tech stack

| Layer | Technologies |
|---|---|
| API | Node 24, TypeScript, Fastify 5, Kysely, `pg`, `node-pg-migrate`, `jose` (JWT), `openid-client` (OAuth/OIDC with PKCE), `sharp` (image processing), AWS S3 SDK (R2), `@fastify/swagger` (OpenAPI) |
| UI | React 19, Vite, React Router, Tailwind CSS, `marked` + DOMPurify (sanitized bio markdown), `fflate` (War export/import zip), MSW (mock mode) |
| API tests | Vitest, `@amiceli/vitest-cucumber` (Gherkin), Testcontainers (PostgreSQL), supertest |
| UI tests | Vitest + Testing Library (unit), Playwright and playwright-bdd (acceptance, against MSW mocks) |
| Infra | Terraform (DigitalOcean and Cloudflare providers), DigitalOcean App Platform, managed PostgreSQL, Cloudflare R2, Cloudflare Workers, GitHub Actions |

## Engineering notes

Things a reviewer may want to look at:

- **Executable Gherkin bound to tests.** Behaviour lives in `.feature` files next to the code,
  and both the API and the UI execute every step
  ([UI conventions](AGENTS.md#ui-acceptance-test-conventions)).
- **Typed client with a CI contract check.** The API's OpenAPI document is generated from its
  route definitions; the UI's request/response types are generated from it and committed.
  The [app pipeline](.github/workflows/app.yml)'s "Generated types match the API" job
  regenerates them on every API change and fails if the committed file is stale.
- **Keyset paging everywhere.** War lists, the moderation log, and the admin lists use opaque
  cursors over microsecond-precision timestamps, so rows created in the same millisecond are
  never skipped and no total count is needed.
- **Lazy War expiry.** A War reads as closed the instant its end date passes; a scheduled
  endpoint then converges the stored status with one atomic update, so repeated or concurrent
  runs are safe. List filters use the same effective-status logic in SQL.
- **Row locking for moderation races.** Suspend/Ban take a `FOR UPDATE` lock on the target
  voter and vote casting takes `FOR SHARE`, so a ban cannot interleave with a vote or a role
  grant. An integration test proves each interleaving with two real transactions.
- **Sessions.** Short-lived JWT plus a rotating refresh-token family with reuse detection;
  PKCE on every provider; a banned voter is rejected on the next authenticated request.
- **Production config guard.** The API refuses to boot on default secrets or a missing
  provider credential.
- **Edge behaviour.** Link-preview tags for each War's link are injected by a Cloudflare
  Worker, since crawlers never run the SPA ([routing](#routing-and-cloudflare-workers)).
- **Deploy safety.** A failed migration leaves the previous revision serving, and production
  promotes the API image staging validated ([deployment](#app-platform-deployment)).
- **Complexity budget.** ESLint enforces cyclomatic complexity of at most 5 in both
  applications.

## Quick start

Prerequisites: Node 24 (the API requires `>=24 <25`), Docker (for Testcontainers and local
Postgres), and, for `war-infra`, Terraform 1.9.

All commands run from the repository root; `npm --prefix <project>` reaches into a project
without `cd`. Each project has its own `package.json` and `node_modules`; there is no
workspace.

### Try the UI with no backend

```
npm --prefix war-ui-default ci
npm --prefix war-ui-default run dev:mock
```

This starts the Vite dev server with the API mocked in the browser (MSW).

### Run the full stack locally

[`scripts/local-dev-up.ps1`](scripts/local-dev-up.ps1) is **Windows-only** (PowerShell). It
starts Postgres and MinIO in Docker, builds and runs `war-api`, runs the Vite dev server, and
puts an nginx TLS proxy in front on `https://localhost:3000` so real OAuth login works (the
refresh-token cookie is `Secure`, so login needs HTTPS). Read the script's header comment for
the one-time OAuth redirect-URI setup.

On macOS or Linux the same pieces can be run by hand, without the unified HTTPS origin:

```
# 1. Postgres (and an S3-compatible store such as MinIO if you want image uploads)
docker run -d --name war-pg -e POSTGRES_USER=war -e POSTGRES_PASSWORD=war \
  -e POSTGRES_DB=war_api -p 5432:5432 postgres:16-alpine

# 2. API: install, migrate, build, run (set the environment variables below first)
npm --prefix war-api ci
DATABASE_URL=postgres://war:war@localhost:5432/war_api npm --prefix war-api run migrate
npm --prefix war-api run build
(cd war-api && node dist/src/server.js)

# 3. UI
npm --prefix war-ui-default ci
npm --prefix war-ui-default run dev
```

The API reads `process.env` only (there is no `dotenv`); `war-api/.env.example` lists the
variables, and Node's `--env-file` flag can load a file. The API **refuses to start** unless
every production-readiness rule passes, even locally: non-default `JWT_SECRET`,
`INTERNAL_TASK_TOKEN`, `PUBLIC_BASE_URL` and `UI_ORIGINS`, plus a client id and secret for
all four providers. That is why the UI mock mode above is the quickest way to look around.

### Environment variables that matter (war-api)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `PORT` | Listen port (default 3000) |
| `PUBLIC_BASE_URL` | The API's own public URL, no trailing slash; derives the OAuth redirect URIs |
| `UI_ORIGINS` | Comma-separated registered UI origins (CORS and refresh-token origin check) |
| `JWT_SECRET`, `INTERNAL_TASK_TOKEN` | Must be non-default; the token guards `/internal/*` |
| `GOOGLE_`, `MICROSOFT_`, `FACEBOOK_`, `TWITTER_` + `CLIENT_ID` / `CLIENT_SECRET` | Provider credentials, all four required |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` | Object storage for contestant media |
| `TRUST_PROXY_HOPS` | Reverse-proxy hops in front of the API. Per-address rate limits stay off until it is set; see [Rate limiting](#rate-limiting) |

The UI reads `VITE_API_BASE_URL` at build time (default `/api/v1`).

### Build, test and lint

The commands for every project (install, lint, typecheck, migrate, test, coverage, build,
Terraform validation, workflow lint) are in the "Build and test" section of
[`AGENTS.md`](AGENTS.md); CI runs the same ones. Integration tests use `DATABASE_URL` when it
is set and otherwise a Testcontainers Postgres, so Docker must be running. The UI acceptance
suite needs a Chromium install once (`npx playwright install chromium`).

Executable Gherkin lives next to the code it describes; see "Specs" in
[`AGENTS.md`](AGENTS.md) for where, and for the `pending/` convention.

## Default UI

`war-ui-default` is a React single-page app (Vite, TypeScript) served as static assets by a Cloudflare Worker. It
talks to `war-api` over REST; behaviour is defined in [`SPEC.md`](SPEC.md) (section
10). Run its scripts from the repository root with `npm --prefix war-ui-default <script>`.
Install, lint, typecheck, test, acceptance, coverage and build are in
[`AGENTS.md`](AGENTS.md); the rest:

| Script | What it does |
|---|---|
| `dev` | Vite dev server against a real `war-api` (`VITE_API_BASE_URL`, default `/api/v1`) |
| `dev:mock` | Dev server with the API mocked in the browser (MSW); no backend needed |
| `build:mock` | Production-style build with the MSW mocks enabled (used by the acceptance suite) |
| `generate:api` | Regenerate `src/api/generated/schema.d.ts` from `war-api`'s OpenAPI document |

`build` typechecks and then builds to `dist/`. `lint` is ESLint, including cyclomatic
complexity (max 5) and the React hooks rules. `typecheck` is `tsc --strict` over `src` and
over tests and config files. `test:acceptance` generates tests from the feature files
(`bddgen`), then runs Playwright against the served mock build.

### Mock mode

`--mode mock` sets `VITE_API_MOCKING=enabled` (`.env.mock`). `src/main.tsx` then starts an MSW
service worker with the baseline handlers in `src/mocks/handlers.ts`.
`mock-sw/mockServiceWorker.js` is served only in mock mode, so it is never part of a real
deployment's `dist/`.

### Source layout

- `src/api`: typed client, error mapping, generated schema
- `src/pages`, `src/components`: routes and shared UI
- `src/hooks`: shared hooks (async resources, cursor paging, debouncing)
- `src/admin`, `src/editWar`, `src/vote`, `src/rankings`, `src/export`, `src/import`: feature code
- `src/theme`: the three visual themes and the theme context
- `src/mocks`: MSW handlers and fixtures for mock mode and tests

## Deployment and operations

Section 11 of [`SPEC.md`](SPEC.md) says what the pipelines and infrastructure must do;
this section is how this repository does it and how to operate it. Every infrastructure
change is applied through CI, never by hand.

### Media storage cutover

Media storage is configured for private R2 buckets, served by the media-router binding.
The state backend remains on Spaces; its backend blocks and Terraform version are unchanged.

1. Create an R2 API token with Object Read and Write access restricted to
   `war-media-staging` and `war-media-production`. Set the GitHub variable
   `R2_ACCESS_KEY_ID` and the secret `R2_SECRET_ACCESS_KEY`; ensure the repository variable
   `CLOUDFLARE_ACCOUNT_ID` identifies the account.
2. After the infrastructure pipeline apply creates the buckets, copy objects for each
   environment, staging first. Configure rclone remotes `spaces` and `r2` with their
   respective S3 endpoints and credentials, then run:
   `rclone sync spaces:war-media-staging r2:war-media-staging` (repeat for production).
   `aws s3 sync` via a local staging directory with the two endpoints is an alternative.
   Compare source and destination object counts, including private originals, before proceeding.
3. Redeploy the app to pick up the R2 endpoint, region `auto` and credentials.
   Verify existing `/media/contestants/...` URLs, uploads and deletion, and confirm
   `/media/originals/...` stays inaccessible.
4. Once copies and URLs are verified, manually delete the old Spaces media and ui-custom
   buckets and their CDN endpoints. Terraform's non-destructive removal blocks leave these
   intact for copying. Keep `war-tfstate` and the Spaces state credentials until the separate
   backend migration; Spaces billing continues while that bucket exists.

### Workflows

[`.github/workflows/`](.github/workflows):

| Workflow | What it does |
|---|---|
| `app.yml` | API and default UI: change-detected CI, API image build, a single UI build, then independent API and UI deploys to staging and (after approval) production |
| `infra.yml` | Terraform validate, plan and gated apply (shared, staging, production) |
| `workflows.yml` | actionlint (with shellcheck) over every workflow file |
| `push-bootstrap-image.yml` | Manual one-off publish of the placeholder image Terraform's initial app spec points at |

Path filters decide what runs (the stage order is in spec section 11.5). The deploy-script
tests run when `war-infra/scripts/` or `war-infra/platform/` changed, and `workflows.yml`
runs on changes under `.github/workflows/`. A manual run forces every check:
`gh workflow run app.yml --ref master`.

### `war-infra/` layout

| Directory | Purpose |
|---|---|
| `terraform/` | Terraform modules and environment roots |
| `platform/` | App Platform specs (`staging.yaml`, `production.yaml`): the source of truth for service configuration after bootstrap, applied by the deploy pipeline and not owned by Terraform |
| `edge/` | Cloudflare Workers for the default UI, media and scheduled tasks |
| `bootstrap/` | The placeholder container image the app is first created with |
| `scripts/` | `smoke-test.sh`, `render-spec.sh` (with `render-spec.test.sh`) and `prune-registry.sh` (with `prune-registry.test.sh`) |
| `specs/` | Gherkin feature files for infrastructure behaviour |

### Environments

Staging is `staging.war.tmad.dev` and deploys on every merge to `master`; production is
`war.tmad.dev` and waits on the `production` GitHub Environment's required reviewer. What each
environment must provide is in spec sections 11.1 and 11.2.

### Terraform

- `ui/`: the default UI Worker and its static assets, applied by `app.yml` (not `infra.yml`)
  with the run's built UI, once per environment (state key `ui/<env>/terraform.tfstate`).
- `shared/`: the container registry, shared PostgreSQL cluster and its database firewall, and the Cloudflare zone-wide settings (zone settings, firewall, rate-limit and cache rulesets).
- `envs/staging/`, `envs/production/`: the environment roots. Each `main.tf` configures the
  providers and the remote state backend (Spaces, S3-compatible), instantiates the modules
  with environment values (node size, counts, hostnames) and handles async dependencies such
  as waiting for App Platform ingress to be ready.
- `modules/`: `compute/` (the App Platform app and its initial spec), `data/` (logical database, credentials and pool), `storage/` (private R2 media bucket), `edge/` (Cloudflare DNS and the media
  Worker route; zone-wide TLS, WAF, rate-limit and cache settings live in `shared/`; the default UI's `/*` route is in `ui/`) and `scheduler/` (Cloudflare cron triggers and Worker bindings).

`infra.yml` is gated as spec section 11.5 describes; the shared apply waits on the
`infra-shared` GitHub Environment's reviewer and the production apply on `production`'s. To
validate locally, use the Terraform commands in "Build and test" in
[`AGENTS.md`](AGENTS.md); repeat them with `envs/production` for production, as CI does.

### Shared database cluster

Staging and production share one managed PostgreSQL cluster, `war-staging-pg` (1 GiB, nyc3,
PostgreSQL 16, one node). Each environment has its own logical database, user and
connection pool on it:

| Environment | Database | User | Pool (size) |
|---|---|---|---|
| staging | `war` | `war_api` | `war-staging-pool` (5) |
| production | `war_production` | `war_production_api` | `war-production-pool` (10) |

Despite its name, `war-staging-pg` is the single cluster serving both staging and
production, and it is tagged `shared`. DigitalOcean cannot rename a database cluster: the
name is fixed at creation, and changing it means a new cluster and a data migration. The
name was kept deliberately.

- **Ownership.** `terraform/shared/` owns the cluster (`prevent_destroy`) and its whole
  firewall rule set, which trusts both apps. The provider manages one complete rule set per
  cluster, so no other root may declare a firewall for it. Each environment root owns only
  its database, user and pool (`modules/data`). Shared reads the app IDs from the repository
  variables `SHARED_DB_STAGING_APP_ID` and `SHARED_DB_PRODUCTION_APP_ID`.
- **Bindings.** Each platform YAML attaches the cluster with its own `db_name` and `db_user`.
  The API service connects through its pool (`${<component>.<pool>.DATABASE_URL}`); the
  PRE_DEPLOY migration job connects directly (`${<component>.DATABASE_URL}`) as the same
  user, because migrations take session-level locks that transaction pooling does not
  support. Production's component is named `shared`, staging's `db`.
- **Capacity.** A 1 GiB cluster allows 22 backend connections. The pools reserve 15,
  leaving room for one direct migration connection per environment and an admin session.
  CPU, disk and outages affect both environments. Resize up in place if load grows;
  DigitalOcean cannot shrink a cluster in place.
- **Standby.** `war-staging-pg` was created before DigitalOcean's 30 November 2026 Standard
  Edition change, so it can still add a standby once resized to 2 GB or more. A replacement
  cluster created after that date could not, so never replace it.

**Isolation is manual SQL.** The DigitalOcean provider cannot manage PostgreSQL grants, and
PostgreSQL grants `CONNECT` to `PUBLIC` by default, so separate users alone do not isolate
the databases. These grants were applied as `doadmin`; reapply them for any new environment
database. On the cluster, connected to `defaultdb`:

```sql
REVOKE ALL ON DATABASE war FROM PUBLIC, war_production_api;
REVOKE ALL ON DATABASE war_production FROM PUBLIC, war_api;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE war TO war_api;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE war_production TO war_production_api;
REVOKE CONNECT ON DATABASE defaultdb FROM PUBLIC, war_api, war_production_api;
GRANT CONNECT ON DATABASE defaultdb TO _doadmin_monitor;
```

Then in each app database (`war` for `war_api`, `war_production` for `war_production_api`):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO <app user>;
```

Check isolation by logging in with each app user's own password (`doctl databases user get`):
its own database must accept it and every other database must refuse it ("User does not
have CONNECT privilege"). Reaching the cluster from outside App Platform needs a temporary
`ip_addr` rule (`doctl databases firewalls append`); the next shared apply removes it.

**App Platform database components.** Two behaviours shaped production's move to this
cluster:

- A component stays attached to the cluster it was first created on, even after its
  `cluster_name` changes; the deploy then fails with `DatabaseUserNotFound`. Moving an app
  to another cluster needs a new component name.
- One deploy cannot add one database component and remove another ("cannot create and
  delete a database in a single spec change"). Add the new component in one deploy and
  remove the old one in the next.

History: until 2026-11-03 each environment had its own cluster, and both apps connected as
`doadmin` to `defaultdb`. Their data was copied into the databases above with `pg_dump` and
`pg_restore`, and production's old cluster, `war-production-pg`, was then deleted, as was
staging's pre-move copy in `defaultdb`. The dumps taken at the move are kept outside the
repository.

### App Platform deployment

Deployment is two-stage:

1. **Terraform bootstrap** creates the App Platform app with a placeholder image and outputs
   its ID (once per environment, a manual step).
2. **Platform specs** (`platform/{env}.yaml`) define services, ingress rules and environment
   variables from then on.

The module sets `ignore_changes = [spec]`, so image tags change on every deploy without a
Terraform apply and secrets are substituted at deploy time without entering state.

To apply the spec to a running app (every placeholder in the template must be set in the
environment; the script fails naming any that is empty):

```bash
IMAGE_TAG=<war-api tree hash> war-infra/scripts/render-spec.sh war-infra/platform/staging.yaml /tmp/app.yaml
doctl apps update <app-id> --spec /tmp/app.yaml --wait
```

`render-spec.sh` derives its placeholder list from the template; its test is
`bash war-infra/scripts/render-spec.test.sh`. The image tag is the git tree hash of
`war-api/` (`git rev-parse HEAD:war-api`).

`app.yml` automates this (stage order: spec section 11.5). The API image is tagged with that
tree hash and built only if the registry lacks it, after API CI passes. One app deploy job per
environment renders the full app spec and applies it with `doctl --wait`; the `PRE_DEPLOY`
migration job runs inside it. A push that needs an API image missing from the registry,
whose API CI did not run in that run, fails with an error; run the workflow manually (see
[Workflows](#workflows)), which builds the image and deploys.

The default UI deploys independently of the API. `ui-ci` builds it once and uploads the
`ui-default-dist` artefact; each environment's UI deploy job downloads that exact build and
applies `war-infra/terraform/ui`, so staging and production serve the same bytes. The app
spec (API only; App Platform serves just `/api/v1`) is applied by a separate app deploy job.
Each side's jobs run only when its own inputs changed. On staging the app job waits for the
UI job and goes ahead unless it failed, so the UI is live and smoke-tested first; in
production the two jobs are independent, so they wait at the gate together and one approval
covers both. There is no edge cache purge: `/assets/*` is `public, max-age=31536000, immutable`
(hashed filenames) and the HTML shell is `max-age=0, must-revalidate`. The asset header rules
live in `war-infra/terraform/ui/asset-headers` (`_headers` syntax), passed to the Worker's
asset config rather than shipped in the build, so they are never served as a file.

**Registry pruning.** The registry would otherwise keep every `war-api` image ever built. After
each successful production deploy, `app.yml`'s `prune-api-images` job runs
`war-infra/scripts/prune-registry.sh`. It reads the tags the staging and production apps run
from their live specs and deletes every other tag except the previous one (the most recent
other tag by updated time, kept for rollback) and `bootstrap`, which the Terraform bootstrap
app needs. It aborts without deleting anything if either environment's tag cannot be read. It
then starts garbage collection, which makes the registry read-only for a few minutes. The job
has its own concurrency group and deliberately none shared with `ensure-api-image`, so a
pending prune can never evict a pending build. A garbage collection that overlaps an image
push makes that push fail visibly; rerun the failed job. The script skips starting garbage
collection when one is already running. A pruned tag
for an unchanged `war-api/` tree is rebuilt on the next deploy. For a one-off cleanup, run it
by hand with an authenticated `doctl`; `--dry-run` lists what it would delete and changes
nothing:

```bash
war-infra/scripts/prune-registry.sh --dry-run
war-infra/scripts/prune-registry.sh
```

Deleting tags is permanent. Do not run it while a deploy is building an image.

**Rollback.** Re-run the deploy jobs of an earlier successful run. They redeploy only the
sides that run changed (its `ui-default-dist` artefact, its app spec, or both), so re-running
a run that changed both also rolls back the API. To roll back production's UI alone, re-run only
that run's `deploy-ui-production` job, which nothing depends on. (Re-running a staging UI job
also re-runs the staging app job, which depends on it.) The artefact is kept for 14 days;
past that, use Cloudflare's Worker version rollback for the UI, or re-run the pipeline on the
old commit.

### Routing and Cloudflare Workers

1. The public hostname reaches the Cloudflare edge (DNS, TLS, WAF, rate limiting).
2. Workers dispatch to origins:
   - `/api/v1/*`: App Platform API (prefix preserved)
   - `/media/*`: media bucket (cached, prefix stripped)
3. Internal endpoints (`/api/v1/internal/*`) are blocked on the public hostname and reachable
   only from the scheduler.
4. Everything else (`/*`) goes to the default UI Worker, which serves its static assets and
   returns the shell for SPA routing.

| Worker | Purpose |
|---|---|
| `ui-default.js` | Serves the default UI's static assets and injects link-preview tags on `/wars/:id` |
| `media-router.js` | Serves only `contestants/*` from its private R2 binding after stripping `/media/`; GET/HEAD, ETags and edge caching |
| `scheduled-tasks.js` | Invoked by Cloudflare cron; dispatches scheduled operations to internal API endpoints |

Media variants are served with a one-year immutable cache on content-addressed
keys; only successful GETs populate the Workers Cache API. Originals are never served by the Worker. The default UI Worker's script runs first on `/wars/*` and rewrites only `/wars/:id`;
other paths are served straight from its assets, except a non-navigation request that matches
no file (a crawler or `curl` asking for a missing `/robots.txt`, say), which reaches the
script and gets the shell. Zone-wide rules (in `terraform/shared/`):
block `/api/v1/internal/*` and `/media/originals/*`; one rate-limit rule on `/api/v1/auth/*`
(10 requests per 10 seconds per address and colo, which is all the Cloudflare Free plan
permits per zone); bypass the cache for the API except rankings.

### Scheduled tasks

One task runs, nightly: the `scheduled-tasks.js` Cron Worker calls
`POST /api/v1/internal/close-expired-wars` with `INTERNAL_TASK_TOKEN` (the `x-internal-token`
header). When a task fails the Worker throws, which marks the invocation failed in Cloudflare.
Why a failure is not an outage: spec section 11.8.

Each successful run is recorded in the database (`platform_settings`). The public endpoint
`GET /api/v1/health/scheduled-tasks` (no auth, `Cache-Control: no-store`) returns 200 with
`last_success_at` while the last success is within 49 hours, and 503 otherwise. Each
environment's uptime check polls it (see Alerts), so a broken API, an unreachable database
or two missed nightly runs all raise the same alert. A new environment (or one restored
from a database without the record) returns 503 until the first nightly run completes:
deploy the API before applying the uptime checks, or trigger the task by hand, or expect
one alert. The threshold is `SCHEDULED_TASKS_MAX_AGE_MS` in `war-api/src/health/routes.ts`.
Automatic retries remain planned
([`TODO/3-monitoring-and-alerting.md`](TODO/3-monitoring-and-alerting.md)).

### Secrets and configuration

Required GitHub Actions secrets (per repository):

| Secret | Used by | Purpose |
|---|---|---|
| `DIGITALOCEAN_ACCESS_TOKEN` | terraform, doctl | DigitalOcean API access |
| `CLOUDFLARE_API_TOKEN` | terraform | Cloudflare API access |
| `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY` | terraform state backend only | DigitalOcean Spaces (S3-compatible); retained until the backend move |
| `R2_SECRET_ACCESS_KEY` | API config | R2 Object Read and Write secret key (its key ID is the `R2_ACCESS_KEY_ID` variable) |
| `INTERNAL_TASK_TOKEN` | terraform scheduler, API config | Authorises internal endpoints |
| `JWT_SECRET` | API config | Session token signing (substituted into the platform spec) |
| `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`, `TWITTER_CLIENT_SECRET` | API config | OAuth provider client secrets |
| `YOUTUBE_API_KEY` | API config | YouTube Data API v3 metadata checks |
| `DOCKERHUB_TOKEN` | API and bootstrap pipelines | Authenticated image pulls (avoids the anonymous rate limit on shared runners) |
| `ALERT_EMAIL` | terraform | Monitoring alert recipient; must belong to a DigitalOcean team member. A secret, not a variable, so the public repository's logs never show it |

The `staging` and `production` GitHub Environments each carry `DO_APP_ID` and
`PUBLIC_BASE_URL`; `production` has the required reviewer. Repository secrets and variables
are also listed in the header of [`app.yml`](.github/workflows/app.yml).

For video attachments, enable **YouTube Data API v3** in a Google Cloud project and create
an API key under **APIs & Services → Credentials**. Restrict the key to YouTube Data API v3.
Store it as the repository secret `YOUTUBE_API_KEY`, shared by both environments like the
other secrets above; the app pipeline injects it into the API as an encrypted runtime variable.
For local development, set the same environment variable before starting the API. The key
is optional at boot, but YouTube attachments return a configuration error when it is absent.
Vimeo attachments use public oEmbed metadata and need no key.

The default UI shell permits frames only from the YouTube no-cookie and Vimeo player
origins. Share pages preserve that policy, and the UI smoke test checks both responses.

Required GitHub Actions variables:

| Variable | Used by | Purpose |
|---|---|---|
| `CLOUDFLARE_ZONE_ID` | terraform | Cloudflare DNS zone ID |
| `CLOUDFLARE_ACCOUNT_ID` | terraform, scheduler | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | API config | R2 access key ID; it identifies the key and does not authenticate on its own |
| `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, `FACEBOOK_CLIENT_ID`, `TWITTER_CLIENT_ID` | API config | OAuth provider client IDs |
| `DO_APP_ID` | app pipeline | App Platform app ID, set once per GitHub environment (staging, production) from Terraform's `app_id` output |
| `PUBLIC_BASE_URL` | app pipeline, API config | The environment's public URL (`https://staging.war.tmad.dev` or `https://war.tmad.dev`), set per GitHub environment |
| `DOCKERHUB_USERNAME` | API and bootstrap pipelines | Docker Hub account that owns `DOCKERHUB_TOKEN` |

### Rate limiting

The API's per-address limits (spec 8.4) need the real client address, which depends on how
many reverse-proxy hops sit in front of the API (spec 11.2). The hop count is **not yet
verified**, so `TRUST_PROXY_HOPS` is unset in `platform/{env}.yaml` and those limits are
**off**; the Cloudflare edge rule on `/api/v1/auth/*` still applies. To enable:

1. Measure the hop count for Cloudflare to App Platform ingress.
2. Set `TRUST_PROXY_HOPS` in `platform/{env}.yaml` to that count.

### Operational constraints

Rules not visible in code, each learned through production incidents:

1. **Manual bootstrap step.** After `terraform apply`, the output includes the new App
   Platform app ID. Store it by hand as the `DO_APP_ID` variable of that GitHub environment;
   the deploy pipeline reads it from there.
2. **One writer per side per environment.** Each environment has one UI deploy job and one
   app deploy job, each in its own concurrency group (`deploy-ui-staging`,
   `deploy-app-staging`, `deploy-ui-production`, `deploy-app-production`). A newer release
   supersedes only a pending job of the same side; that is safe because the newer job
   carries the whole of that side at a later commit (the run's single UI build, or the API
   image tag and app spec). A UI-only release therefore never evicts a pending API deploy, or
   the reverse. Sharing one group between both sides while each run deploys only what
   changed, or a job that deployed only part of a side, would reintroduce the eviction
   problem (commit 9404ffe).
3. **Placeholder image.** Terraform cannot bootstrap the app with the real API image (it
   needs secrets to boot), so a placeholder is pushed once (`push-bootstrap-image.yml`) and
   the first deploy replaces it.
4. **Platform spec ownership.** After bootstrap, changes to the app go in
   `platform/{env}.yaml`, not in the Terraform compute module, which ignores spec changes by
   design; every apply would otherwise roll back the running deployment.
5. **`infra-shared` environment.** The shared apply is gated by a required reviewer on the
   `infra-shared` GitHub Environment. Create the environment and add the reviewer before the
   first run: otherwise GitHub auto-creates it unprotected and the shared apply goes ungated.
6. **OAuth redirect URIs.** Provider redirect URIs (e.g.
   `https://staging.war.tmad.dev/auth/google/callback`) must be registered by hand with each
   provider, per environment. Nothing in the pipeline does this; sign-in fails silently if
   missing.

### First-time setup of an environment

1. **Provider apps.** Register an app with each of Google, Microsoft, Facebook and Twitter/X,
   put the client IDs and secrets in GitHub (see [Secrets and
   configuration](#secrets-and-configuration)) and register the environment's redirect URI
   with each provider. Do this before a deploy reaches the environment: the API refuses to
   boot with any provider unconfigured. Bring staging up first and confirm sign-in works end
   to end with each provider, then production.
2. **Provider verification** is a manual step in each provider's console: Microsoft needs
   publisher/domain verification and Twitter/X a developer app review. Google, Microsoft and
   Twitter/X are done; Facebook is not (see [`TODO/8-restore-facebook-sign-in.md`](TODO/8-restore-facebook-sign-in.md)).
3. **Seed the first Admin**, once per environment, after that environment's deploy has run
   (it needs the roles migration) and the owner has signed in once. Nothing else grants the
   role, since granting is Admin-only (spec 6.6). Run from the repository root with dev
   dependencies installed (`npm --prefix war-api ci`):

   ```powershell
   $env:NODE_EXTRA_CA_CERTS = "<that cluster's CA certificate file>"
   $uri = doctl databases connection <cluster-id> --format URI --no-header
   if (-not $uri) { throw "No connection string returned" }
   $env:DATABASE_URL = $uri -replace '/defaultdb\?', '/<database>?'
   Remove-Variable uri
   npm --prefix war-api run seed-admin -- <voter-id>
   Remove-Item Env:DATABASE_URL, Env:NODE_EXTRA_CA_CERTS
   ```

   - Both environments use `war-staging-pg`; its id comes from `doctl databases list`.
     `<database>` is `war` for staging and `war_production` for production. The URI is
     `doadmin`'s and names `defaultdb`, which holds no app data.
   - The voter id is `voter.id` in the response of `GET /api/v1/auth/me` while signed in on
     that environment; ids differ per environment.
   - Your IP must be in the cluster's trusted sources
     (`doctl databases firewalls append <cluster-id> --rule ip_addr:<ip>`) or the connection
     times out.
   - DigitalOcean issues a separate CA per cluster; the wrong file fails with "self-signed
     certificate in certificate chain".
   - Fetching the URI through `doctl` keeps the password out of shell history and
     transcripts. Success prints `Granted admin to voter <id>`.
4. **GitHub Environments** `staging`, `production` and `infra-shared` exist with their
   reviewers (see constraint 5 above).

### Smoke tests

Each deploy job runs its side's smoke test after deploying, to catch deploy-time failures
before production:

- **API:** POST to internal endpoints, verify basic health.
- **UI:** load the app, verify key pages render.

See `war-infra/scripts/smoke-test.sh` and the deploy jobs in `app.yml`.

### Alerts

The App Platform app alerts on CPU, memory, restart count, failed deployment and failed
domain. Terraform also declares these DigitalOcean alerts:

- Shared database `war-staging-pg`: CPU, memory and disk utilization above 80% over
  5 minutes, owned by the shared Terraform root. DigitalOcean already creates default
  90% CPU, memory and disk alerts on database clusters; these 80% policies are additional.
- One HTTPS uptime check per environment, from US East and Europe West, targeting only
  `https://<domain>/api/v1/health/scheduled-tasks`. This covers API/database availability
  and stale nightly jobs through a single signal. It alerts when down for 2 minutes,
  when latency exceeds 2000 ms for 5 minutes, or when the TLS certificate expires within
  14 days. The endpoint is described under Scheduled tasks.

All new alerts email `ALERT_EMAIL`. Before running the infrastructure workflow, set
`ALERT_EMAIL` as a **GitHub repository secret** to an email address on the DigitalOcean
team; Terraform marks it sensitive, so plans redact it too. Check the workflow's `DIGITALOCEAN_ACCESS_TOKEN` has monitoring and uptime read,
create, update and delete permissions; the local doctl token previously returned 403 on
`GET /v2/monitoring/alerts` and may need additional scopes.

Database monitoring alerts have no additional charge. [Uptime checks cost $1/month each,
with one free check per account](https://docs.digitalocean.com/products/uptime/details/pricing/)
and no additional charge for alerts: two environments cost about $1/month assuming the
account's free allowance is available and no other checks consume it (otherwise about
$2/month incremental).

Request error rate, p99 latency, exception tracking, connection-pool and edge-spike
alerting remain planned (
[`TODO/3-monitoring-and-alerting.md`](TODO/3-monitoring-and-alerting.md)).

## Status and specification

[`SPEC.md`](SPEC.md) describes what the platform does today; everything in it is built.
Planned work is tracked in [TODO.md](TODO.md).
[`docs/building-a-war-import.md`](docs/building-a-war-import.md) holds instructions written
for an AI assistant that assembles a War import file for the app's Import feature.

## License

Copyright © 2026 Tom Adams. All rights reserved.

This repository is publicly available for viewing purposes only. No
permission is granted to copy, modify, distribute, sublicense, or use this software or its
source code for commercial purposes without prior written permission.
