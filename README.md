# War

A web-first social voting platform. Authenticated users rank contestants through head-to-head
binary matchups: a creator builds a War (a category, a set of contestants with images and
bios, an end date), publishes it, and voters pick a winner in one matchup after another until
the War's rankings emerge. Sign-in is via Google, Microsoft, Facebook, or Twitter/X; there is
a Moderator/Admin staff layer with abuse reporting, a moderation log, and a War-creation kill
switch.

**Live:** [war.tmad.dev](https://war.tmad.dev) (production) and
[staging.war.tmad.dev](https://staging.war.tmad.dev) (staging). Signing in needs an account
with one of the four providers. To click through the UI without any backend, run it in
[mock mode](#try-the-ui-with-no-backend).

This is a single-author showcase repository, not an accepting-contributions project. The
project was developed with an AI-assisted TDD workflow; [`CLAUDE.md`](CLAUDE.md) holds those
working conventions.

## Architecture

Three projects and one specification:

| Path | What it is |
|---|---|
| [`war-spec.md`](war-spec.md) | The platform specification: what the system does, in implementation-agnostic terms. Where a test and the spec disagree, the spec wins. |
| [`war-api/`](war-api) | Backend REST API: Node/TypeScript, Fastify, Kysely, PostgreSQL |
| [`war-ui-default/`](war-ui-default) | Default web frontend: React SPA, Vite, Playwright |
| [`war-infra/`](war-infra) | Terraform, App Platform specs, Cloudflare Workers, deploy scripts |

A brand-specific custom UI (spec section 11) is its own repository, not a directory here;
[`.github/workflows/ui-custom.yml`](.github/workflows/ui-custom.yml) is the reusable pipeline
each one calls. Custom UIs and the registry behind them are specified but not built.

```mermaid
flowchart LR
  B[Browser] --> CF["Cloudflare edge<br/>DNS, WAF, rate limit, cache rules"]
  CF -->|"/api/v1/*"| API["war-api<br/>App Platform service"]
  CF -->|"everything else, /ui/default/*"| UI["war-ui-default<br/>App Platform static site"]
  CF -->|"/media/*<br/>media-router Worker"| CDN["Spaces CDN<br/>images"]
  CF -->|"/ui/slug/*<br/>ui-router Worker"| CUI["Spaces<br/>custom UI bundles"]
  CF -->|"/wars/id<br/>og-tags-router Worker"| UI
  API --> PG[("Managed PostgreSQL<br/>pooled connection")]
  API --> SP["Spaces<br/>image storage"]
  CRON["Cloudflare cron Worker"] -->|"POST /internal/close-expired-wars"| API
```

Staging and production are each one DigitalOcean App Platform app, with the API image and the
static UI served from a single domain. In [`war-infra/`](war-infra): `terraform/` (shared,
per-environment, and modules for compute, data, storage, edge, scheduler), `platform/` (the
App Platform specs, which the deploy pipeline applies and Terraform does not own), `edge/`
(the Cloudflare Workers), `bootstrap/` (placeholder image), `scripts/smoke-test.sh`, and
`tools/concurrency-groups/`. [`war-infra/README.md`](war-infra/README.md) covers deploys,
secrets and operational rules.

## Tech stack

| Layer | Technologies |
|---|---|
| API | Node 24, TypeScript, Fastify 5, Kysely, `pg`, `node-pg-migrate`, `jose` (JWT), `openid-client` (OAuth/OIDC with PKCE), `sharp` (image processing), AWS S3 SDK (Spaces), `@fastify/swagger` (OpenAPI) |
| UI | React 19, Vite, React Router, Tailwind CSS, `marked` + DOMPurify (sanitized bio markdown), `fflate` (War export/import zip), MSW (mock mode) |
| API tests | Vitest, `@amiceli/vitest-cucumber` (Gherkin), Testcontainers (PostgreSQL), supertest |
| UI tests | Vitest + Testing Library (unit), Playwright and playwright-bdd (acceptance, against MSW mocks) |
| Infra | Terraform (DigitalOcean and Cloudflare providers), DigitalOcean App Platform, managed PostgreSQL, Spaces + CDN, Cloudflare Workers, GitHub Actions |

## Engineering notes

Things a reviewer may want to look at:

- **Executable Gherkin bound to tests.** Behaviour lives in `.feature` files next to the code
  (`war-api/specs/features/`, `war-ui-default/features/`). API scenarios are bound with
  `@amiceli/vitest-cucumber`, which executes every step; UI scenarios are executed the same way
  with playwright-bdd, so a step with no definition fails the run
  ([conventions](war-ui-default/tests/acceptance/README.md)).
- **Typed client with a CI contract check.** The API's OpenAPI document is generated from its
  route definitions; the UI's request/response types are generated from it and committed.
  The [OpenAPI Contract workflow](.github/workflows/openapi-contract.yml) regenerates them on
  every API change and fails if the committed file is stale.
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
- **Production config guard.** The API refuses to boot with default secrets, a missing
  provider credential, or a localhost-shaped public URL.
- **Edge behaviour.** Link-preview tags for each War's own link are injected by a Cloudflare
  Worker (crawlers never run the SPA); originals and internal task endpoints are blocked at
  the edge.
- **Deploy safety.** Migrations run as an App Platform `PRE_DEPLOY` job, so a failed
  migration leaves the previous revision serving. Production deploys the exact image staging
  validated. A guard workflow fails the build if two pipelines share a GitHub concurrency
  group (a collision that once silently cancelled a production deploy).
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
| `TRUST_PROXY_HOPS` | Number of reverse-proxy hops in front of the API. **Per-address rate limits (sign-in start 10/min, token refresh 30/min) stay off until this is set**, so an unconfigured deploy never throttles every client as one address. The platform specs do not set it yet. |

The UI reads `VITE_API_BASE_URL` at build time (default `/api/v1`).

### Tests

War-api (unit, integration and acceptance; integration tests use `DATABASE_URL` when set,
otherwise a Testcontainers Postgres, so Docker must be running):

```
npm --prefix war-api ci
npm --prefix war-api run lint
npm --prefix war-api run typecheck
npm --prefix war-api run migrate        # test DB, only when DATABASE_URL is set
npm --prefix war-api test
npm --prefix war-api test -- -t "<name>"
```

War-ui-default:

```
npm --prefix war-ui-default ci
npm --prefix war-ui-default run lint
npm --prefix war-ui-default run typecheck
npm --prefix war-ui-default test                       # unit
npm --prefix war-ui-default run test:acceptance        # Playwright; run `npx playwright install chromium` once
npm --prefix war-ui-default run test:acceptance -- -g "<name>"
npm --prefix war-ui-default run build
```

War-infra:

```
terraform fmt -check -recursive war-infra
terraform -chdir=war-infra/terraform/envs/staging init -backend=false
terraform -chdir=war-infra/terraform/envs/staging validate
npm --prefix war-infra/tools/concurrency-groups ci
npm --prefix war-infra/tools/concurrency-groups test
```

| Project | Feature files | Bound by |
|---|---|---|
| API | `war-api/specs/features/` | `war-api/test/features/*.steps.ts` |
| Default UI | `war-ui-default/features/` | `war-ui-default/tests/acceptance/steps/*.steps.ts` |
| Infrastructure | `war-infra/specs/features/` | not bound: `war-infra` has no scenario runner |

Each `features/` directory has a `pending/` subdirectory for scenarios with no binding yet.
See [`PROGRESS.md`](PROGRESS.md) for what is there.

## CI/CD and deploy

Workflows in [`.github/workflows/`](.github/workflows), all path-filtered:

| Workflow | What it does |
|---|---|
| `api.yml` | Lint, typecheck, migrate and test against a Postgres service; build the image; on `master`, deploy to staging, then production behind the `production` environment's required reviewer. Renders `war-infra/platform/{env}.yaml` with the commit's image tag, applies it with `doctl --wait` (the `PRE_DEPLOY` migration job runs inside it), then smoke-tests. |
| `ui-default.yml` | Lint, typecheck, unit, Playwright acceptance (MSW mocks), build; on `master`, trigger the App Platform static-site deployment, purge the edge cache for `index.html`, smoke test; staging then gated production. |
| `infra.yml` | `terraform fmt`, `validate`, `tflint`; plan on pull requests; on `master`, apply shared, staging, then production (approval gate). |
| `openapi-contract.yml` | Regenerates the UI's typed client from the API and fails if the committed types differ. |
| `concurrency-groups.yml` | Fails if two workflow files declare the same concurrency group. |
| `ui-custom.yml` | Reusable pipeline for separate custom-UI repositories. |
| `push-bootstrap-image.yml` | Manual one-off publish of the placeholder image Terraform's initial app spec points at. |

Section 12 of [`war-spec.md`](war-spec.md) describes the deployment model.

## Status and specification

[`PROGRESS.md`](PROGRESS.md) is the status board: what is built, what is not, known defects,
and operational prerequisites. In short, the voting loop, War authoring (edit, publish,
export/import, share images, themes), the staff/moderation layer and the admin dashboard are
built and deployed; video-mode matchups, custom UIs, Apple sign-in, provider linking, and
monitoring/alerting beyond App Platform's basic alerts are not.

[`war-spec.md`](war-spec.md) describes the full design, including parts not yet built, so a
section being present in the spec does not mean it ships.
[`docs/building-a-war-import.md`](docs/building-a-war-import.md) holds instructions written
for an AI assistant that assembles a War import file for the app's Import feature.

## License

Copyright © 2026 Tom Adams. All rights reserved.

This repository is publicly available for viewing and evaluation purposes only. No
permission is granted to copy, modify, distribute, sublicense, or use this software or its
source code for commercial purposes without prior written permission.
