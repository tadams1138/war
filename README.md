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

The platform is three projects and one specification. [`war-spec.md`](war-spec.md) says what
the system does, in implementation-agnostic terms; where a test and the spec disagree, the
spec wins. [`war-api/`](war-api) is the backend REST API, [`war-ui-default/`](war-ui-default)
the default web frontend (a React single-page app) and [`war-infra/`](war-infra) the
Terraform, App Platform specs, Cloudflare Workers and deploy scripts. The technologies are in
[Tech stack](#tech-stack).

A brand-specific custom UI (spec section 11) is its own repository, not a directory here;
[`.github/workflows/ui-custom.yml`](.github/workflows/ui-custom.yml) is the reusable pipeline
each one calls. Custom UIs and the registry behind them are specified but not built.

```mermaid
flowchart LR
  B[Browser] --> CF["Cloudflare edge<br/>DNS, WAF, rate limit, cache rules"]
  CF -->|"/api/v1/*"| API["war-api<br/>App Platform service"]
  CF -->|"/* (everything else)"| UI["war-ui-default Worker<br/>static assets, and link-preview<br/>tags on /wars/id"]
  CF -->|"/media/*<br/>media-router Worker"| CDN["Spaces CDN<br/>images"]
  CF -->|"/ui/slug/*<br/>ui-router Worker"| CUI["Spaces<br/>custom UI bundles"]
  API --> PG[("Managed PostgreSQL<br/>pooled connection")]
  API --> SP["Spaces<br/>image storage"]
  CRON["Cloudflare cron Worker"] -->|"POST /internal/close-expired-wars"| API
```

Staging and production are each one DigitalOcean App Platform app serving the API image, with
the default UI served by a Cloudflare Worker with static assets on the same domain. The layout of `war-infra/` and how it is deployed and
operated are under [Deployment and operations](#deployment-and-operations).

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

- **Executable Gherkin bound to tests.** Behaviour lives in `.feature` files next to the code,
  and both the API and the UI execute every step
  ([UI conventions](#ui-acceptance-test-conventions)).
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
talks to `war-api` over REST; behaviour is defined in [`war-spec.md`](war-spec.md) (section
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

## UI acceptance test conventions

Required reading before adding or changing a UI scenario. Paths are relative to
`war-ui-default/` (`features/`, `src/`) or, for `steps/` and `support/`, to
`war-ui-default/tests/acceptance/`.

Unit tests (Vitest) cover `api/client.ts` logic, pure helpers and hooks. Acceptance tests
load the mock build and set up each scenario with data-driven MSW recipes
(`tests/acceptance/support/mocking.ts`, `src/mocks/scenarios.ts`); shared helpers live in
`tests/acceptance/support/`.

Every scenario in `features/*.feature` is executed step by step with
[playwright-bdd](https://github.com/vitalets/playwright-bdd), against the mock build (MSW). A
step with no definition fails the run, and a step's text is what the test does: the Gherkin
cannot drift from the tests. `features/pending/` holds scenarios with no steps yet; it is not
globbed and never runs.

`npm --prefix war-ui-default run test:acceptance` is `bddgen && playwright test`. `bddgen`
regenerates the tests from the feature files into `.features-gen/` (ignored by git, ESLint and
Vitest; never edit it). Always go through the npm script: `playwright test` alone runs stale
generated tests. Scope a run with `-- -g "<scenario title>"` (generated titles carry the
feature's tag, and `-g` still matches the title).

### Acceptance coverage

`npm --prefix war-ui-default run test:acceptance:coverage` runs the same suite with `COVERAGE=1`:
`vite.config.ts` then instruments the mock build (istanbul, `src/**` minus `src/api/generated`,
`src/mocks` and tests), and the `coverage` fixture in `steps/fixtures.ts` writes each test's
`window.__coverage__` to `.nyc_output/` (one file per test, so workers never collide). Without
`COVERAGE` nothing changes: the build is not instrumented and no file is written.

- A coverage run never reuses a running preview server (`reuseExistingServer` is off for it),
  so it cannot silently measure an uninstrumented build; stop whatever holds port 4173 first.
- It leaves an instrumented `dist/`; `npm run build` replaces it.
- `npm run test:coverage` (Vitest, istanbul) writes the unit data to `.nyc-unit/`, and
  `npm run coverage:report` (nyc) then reports unit, acceptance and merged (unit plus acceptance)
  into `coverage/{unit,acceptance,merged}/`. The acceptance data is mapped to source
  coordinates before the merge. `npm run coverage:check` enforces the thresholds CI applies.
- The data is taken from the page when a test ends, so counters from a page the test navigated
  away from (a full reload) are lost. The unit and acceptance instrumentations differ: statement
  and line locations line up (a few JSX `return` statements exist in only one, so the merge can
  understate by a fraction of a point), but branch locations do not, so the merged branch figure
  is not meaningful. Branches are judged on the acceptance report alone.

### Acceptance test layout

| Path (under `tests/acceptance/`) | Role |
|---|---|
| `steps/fixtures.ts` | The `test` object every step file imports, with the per-scenario `world` fixture |
| `steps/parameters.ts` | The custom parameter types, registered by `fixtures.ts` (below) |
| `steps/shared*.steps.ts` | Untagged steps whose text means the same in every feature: `shared.steps.ts` (general), `shared-nav` (identity menu and name), `shared-calls` (API calls, `{call}`), `shared-lists` (Admin Dashboard lists, `{list}`), `shared-bio` (rendered bios, `{bio}`), `shared-layout` (where controls sit and how they look) |
| `steps/<feature>.steps.ts` | One feature's steps, scoped by that feature's tag |
| `support/` | Helpers and the registries behind the parameter types: `pageNames`, `calls`, `lists`, `fields`, `cards`, `bios`, `roles`, `screens`, `providers`; and `mocking`, `recipes`, `pages`, `editWar`, `results`, `adminRecords`, `adminFixtures`, `exportArchive` |

### Writing conventions

Priorities, in order, when they conflict:

1. **Accuracy.** The Gherkin says precisely what the owner means and what the test does:
   domain behaviour, not HTTP or implementation detail.
2. **Concision.** As few words as say it.
3. **Reuse.** As few step definitions as cover every feature. Reword a step to match an
   existing one when the meaning is the same; generalise a step (a parameter, a registry entry)
   rather than adding a near-duplicate.
4. **Code principles.** DRY, SOLID, cyclomatic complexity of 5 or below (ESLint enforces it).

Rules:

1. **Tag each feature** with `@<feature-name>` on the line above `Feature:`.
2. **Scope a feature's steps by that tag**: in `<feature>.steps.ts`,
   `const { Given, When, Then } = createBdd(test, { tags: '@<feature-name>' })`, with `test`
   imported from `./fixtures`. A tagged step cannot collide with, or leak into, another feature.
3. **Share a step only when its behaviour is identical everywhere.** Such steps go in a
   `shared*.steps.ts`, untagged. Before writing a feature step, check the shared files and the
   other `*.steps.ts`: when another feature already has the same step, move it to a shared file
   (with its helpers) rather than duplicate it. Two untagged definitions of the same text make
   `bddgen` fail ("Multiple definitions matched scenario step").
4. **Steps must be true, and the Gherkin is the owner's intent.** When a step claims more than
   the test arranges or checks, strengthen the test: arrange what the Given says, assert what
   the Then claims. Do not reword the Gherkin down to fit a weak test. Reword it only when it
   contradicts `war-spec.md` or cannot be verified in a UI test, and then report it as an open
   question. Where the text merely misdescribes *how* the test works (an implementation detail,
   a wrong name), fix the text.
5. **No no-op steps.** A step whose definition does nothing (`Given no voter is authenticated`)
   is not allowed. Say it in the scenario title ("An unauthenticated visitor is redirected to
   log in"), in a subject that implies it (`When a visitor opens ...`), or in the feature's
   free-form description or a `#` comment.
6. **Never lose an assertion.** Strengthening is fine; weakening or dropping is not. Where an
   absence is asserted (`is hidden`, `is not shown`), something present on the same render must
   come first (a heading, a request that was made), or the check passes before the page loads.
7. **API mocks come before the app boots.** A recipe may carry a `query` (`creator=me`) so it
   answers only requests with those parameters; the more specific recipe wins. A response with
   `echoRequest` answers with the JSON body the request carried; with `mergeRequest`, the record
   merged with it. Given steps queue mock responses with `world.queue(...)`; a feature's `Before` hook may add `world.fallbacks`, answers tried only after the queued ones (the Admin Dashboard's panels). The app boots on the
   first navigation (`a visitor opens {page}`, `they open {page}`, `they are on {page}`) or on
   `Given an authenticated voter`, which then signs in. `world.queue` throws after boot, so
   order the Givens accordingly. Access tokens live only in memory (spec section 10): a full page
   load drops the session, so once signed in, navigation stays client-side.
8. **Name pages with `{page}`**, never with a new navigation step. Add pages to
   `support/pageNames.ts`. "That War" resolves against `world.warId`.
9. **Mark each step's phase** with one comment, as `war-api` does: `// Arrange` in a Given,
   `// Act` in a When, `// Assert` in a Then.
10. **Keep `World` small.** Add a field to the `World` class in `fixtures.ts` only for state that
    a later step really needs.
11. **Swipes never vote**; only clicks, taps and button presses do.

### Acceptance parameter types and registries

Add an entry to the registry, not a new step.

| Type | Registry | Examples |
|---|---|---|
| `{page}` | `support/pageNames.ts` (path, landmark, `error` test id) | `Home`, `that War's Edit page`, `"/wars/new"` |
| `{role}` | `support/roles.ts` | `voter`, `Moderator`, `Admin`, `Admin and Moderator` |
| `{screen}` | `support/screens.ts` | `phone`, `desktop`, `wide`, `narrow landscape`, `narrow portrait` |
| `{side}`, `{card}` | `support/screens.ts`, `support/cards.ts` | `left`; `the left contestant's card`, `the result of "Ada"` |
| `{bio}` | `support/bios.ts` | `the bio preview`, `the bio of "Ada"` |
| `{provider}` | `support/providers.ts` | `Google`, `X` |
| `{list}` | `support/lists.ts` | `the Wars list`, `the vote history` |
| `{call}` | `support/calls.ts` | `remove that War`, `remove the contestant "Ada"` |
| `{field}` | `support/fields.ts` | `title`, `contestant's bio` |
| `{status}`, `{state}` | `parameters.ts` | `draft`, `published`, `closed`; `on`, `off` |

### Acceptance shared vocabulary

Use these before writing new steps.

| Step | Does |
|---|---|
| `Given an authenticated {role}` | Boots the app with the queued mocks, opens Home, signs in. The roles queue the matching `GET /auth/me`; if the signed-in voter's own detail (`voter-1`) was given, `/auth/me` then reads as that detail does after each change. An Admin also manages every War given before it (the API reports `can_manage`) |
| `Given they are on {page}` / `When they open {page}` / `When a visitor opens {page}` | Boots if needed and navigates (client-side once signed in). "A visitor" means not signed in |
| `Given a(nother) War` / `Given a(nother) {status} War` / `Given a(nother) War themed {string}` | Queues a War's detail as its creator sees it. Wars are numbered `war-1`, `war-2`, ...; "that War" is the latest given |
| `Given the voter created that War` | The viewer owns that War |
| `Given that War has contestants:` (table: `name`, optional `bio` (`\n` is a line break), `images` (default 1), `votes` (default 0); optional results columns `rank` (blank: unranked), `wins`, `appearances`) | Replaces that War's default contestant. The War's results list them in this order, ranked 1, 2, ... unless `rank` says otherwise. A contestant is addressed by its name, its images by position |
| `Given the API lists these Wars:` (table: `title`, `status`, optional `category`, `contestants`, `share image`) | Queues `GET /wars` and each War's detail |
| `Given the API accepts a share image upload` / `Then the share image is uploaded to that War` | Queues, and asserts, the `POST` of that War's share image |
| `Given the API creates an empty draft War` | Queues the create call and the draft it makes |
| `Given that War has a matchup to vote on` and the `{side}` contestant Givens | The default matchup and edits to it (name, bio, images). `that matchup is the last one the voter has to decide`; `the voter has voted on {int} of {int} matchups in that War` |
| `Given the voter's session has expired and cannot be refreshed` / `Given the API accepts votes` | Queued answers |
| `Given a {screen} screen` | Sets the viewport |
| `Given the API accepts / refuses / rejects / fails / rate limits a request to {call}`, `Given the target of a request to {call} does not exist` | Queues the answer to a write. Accepting also queues how the changed record then reads |
| `Then the API has been asked to {call}` (`with:` a table of `{field}` values) / `has not been asked to {call}` / `Then {call} was/were requested {int} time(s)` / `Then nothing has been removed` | Requests made, exactly once / never / counted / no `DELETE` or Moderator remove at all |
| `Then an error is shown on {page}` / `for the request to {call}` / `Then a wait is shown, using the supplied delay, not an error` / `Then no error message is shown` | An error is an alert in the place the failed thing was done (the `error` test id of the page or call); a wait is a status (spec section 10.5) |
| `When they select the "<name>" button` or `link` / `Then the "<name>" button` or `link` `is shown` / `hidden` / `enabled` / `disabled` | A control by its label. `enabled` / `disabled` also check it looks so: dimmed with no pointer when disabled |
| `Then a confirmation is shown` / `no confirmation is shown` / `the confirmation says {string}` / `When they confirm` / `When they cancel` | The alert dialog every dangerous action asks first |
| `Then the message {string} is shown` / `is not shown` / `Then the heading {string} is shown` | Exact visible text / a heading |
| `Then {page} is shown` / `they are redirected to {page}` / `... to the login page with returnTo {page}` | Asserts the path and the page's landmark |
| `When they vote for {string}` / `Then no vote is submitted` / `voting is disabled` / `voting re-enables` / `the matchup is shown` | Vote mode |
| `When they click the next-image arrow on {card}` / `Then {card} offers paging controls` / `{card} shows image {int}` | A card's images, by display order: the active dot, the visible image, its source |
| `Then {bio} says / shows ... / links {string} to {string} / separates its paragraphs ...` | A rendered bio |
| `Then A, B and C sit in one horizontal row, in that order` / `share consistent button styling` / `X is visually set apart from A and B` / `the "X" button` or `link` `is above A and B` / `is centered on the page` / `is larger than an ordinary button` | Where controls sit and how they look, by label |
| `Then a zip of that War's definition downloads` | Export |
| `When they select {string} in {list}` / `filter {list} by {string}` / `search {list} for {string}` / `Then {list} shows only / shows, in order:` / `was last requested for ...` | Admin Dashboard lists. A filter option asks for the status of its lower-cased label unless the list's `statuses` says otherwise (`Role holders` asks for `role`) |
| `When they open the identity menu` / `select {string} from the identity menu` / `Then the identity menu links ...` / `the navigation shows the name {string}` / `they are signed out` / `signed in` | The header |
| `When they choose {string} from the sort menu` / `Then the sort menu shows {string}` / `the search box is shown` / `an empty state is shown` / `a link to create a War is shown` / `the page renders in the {string} theme` | Lists and themes |

### Adding or changing a UI scenario

1. Write the scenario in `features/<name>.feature`. Reuse the vocabulary above.
2. Add steps to `steps/<name>.steps.ts` (or move one to a shared file, rule 3).
3. Run it: `npm --prefix war-ui-default run test:acceptance -- -g "<scenario title>"`.
4. Prove it can fail: change one expected value, or break the app behaviour it covers, see the
   run go red, restore it.
5. Run lint (zero warnings), typecheck, unit tests, the full acceptance suite and the build
   (commands in [`AGENTS.md`](AGENTS.md)).

### Acceptance pitfalls

- **The keyword is not part of a step's identity.** playwright-bdd matches step text alone, so
  `Given they are on {page}` and `Then they are on {page}` collide. Give a Then its own text
  (`Then {page} is shown`).
- **Vitest must not see `.features-gen/`.** `vitest.config.ts` excludes it.
- **Scenario Outlines** run, but the report titles keep the unsubstituted placeholder in the
  parent describe block.

## Deployment and operations

Section 12 of [`war-spec.md`](war-spec.md) says what the pipelines and infrastructure must do;
this section is how this repository does it and how to operate it. Every infrastructure
change is applied through CI, never by hand.

### Workflows

[`.github/workflows/`](.github/workflows):

| Workflow | What it does |
|---|---|
| `app.yml` | API and default UI: change-detected CI, API image build, a single UI build, then independent API and UI deploys to staging and (after approval) production |
| `infra.yml` | Terraform validate, plan and gated apply (shared, staging, production) |
| `workflows.yml` | actionlint (with shellcheck) over every workflow file |
| `ui-custom.yml` | Reusable pipeline for separate custom-UI repositories |
| `push-bootstrap-image.yml` | Manual one-off publish of the placeholder image Terraform's initial app spec points at |

Path filters decide what runs (the stage order is in spec section 12.5). The deploy-script
tests run when `war-infra/scripts/` or `war-infra/platform/` changed, and `workflows.yml`
runs on changes under `.github/workflows/`. A manual run forces every check:
`gh workflow run app.yml --ref master`.

### `war-infra/` layout

| Directory | Purpose |
|---|---|
| `terraform/` | Terraform modules and environment roots |
| `platform/` | App Platform specs (`staging.yaml`, `production.yaml`): the source of truth for service configuration after bootstrap, applied by the deploy pipeline and not owned by Terraform |
| `edge/` | Cloudflare Workers for the default UI, media, scheduled tasks and custom UI dispatch |
| `bootstrap/` | The placeholder container image the app is first created with |
| `scripts/` | `smoke-test.sh` and `render-spec.sh` (with `render-spec.test.sh`) |
| `specs/` | Gherkin feature files for infrastructure behaviour |

### Environments

Staging is `staging.war.tmad.dev` and deploys on every merge to `master`; production is
`war.tmad.dev` and waits on the `production` GitHub Environment's required reviewer. What each
environment must provide is in spec sections 12.1 and 12.2.

### Terraform

- `ui/`: the default UI Worker and its static assets, applied by `app.yml` (not `infra.yml`)
  with the run's built UI, once per environment (state key `ui/<env>/terraform.tfstate`).
- `shared/`: the container registry and the Cloudflare zone-wide settings (zone settings, firewall, rate-limit and cache rulesets).
- `envs/staging/`, `envs/production/`: the environment roots. Each `main.tf` configures the
  providers and the remote state backend (Spaces, S3-compatible), instantiates the modules
  with environment values (node size, counts, hostnames) and handles async dependencies such
  as waiting for App Platform ingress to be ready.
- `modules/`: `compute/` (the App Platform app and its initial spec), `data/` (PostgreSQL
  cluster with a connection pooler), `storage/` (Spaces buckets for media, custom UIs and
  state), `edge/` (Cloudflare DNS, TLS, WAF rules, rate limiting, Worker routes, including the default UI's `/*` route) and
  `scheduler/` (Cloudflare cron triggers and Worker bindings).

`infra.yml` is gated as spec section 12.5 describes; the shared apply waits on the
`infra-shared` GitHub Environment's reviewer and the production apply on `production`'s. To
validate locally, use the Terraform commands in "Build and test" in
[`AGENTS.md`](AGENTS.md); repeat them with `envs/production` for production, as CI does.

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

`app.yml` automates this (stage order: spec section 12.5). The API image is tagged with that
tree hash and built only if the registry lacks it, after API CI passes. One app deploy job per
environment renders the full app spec and applies it with `doctl --wait`; the `PRE_DEPLOY`
migration job runs inside it. A push that needs an API image missing from the registry,
whose API CI did not run in that run, fails with an error; run the workflow manually (see
[Workflows](#workflows)), which builds the image and deploys.

The default UI deploys independently of the API. `ui-ci` builds it once and uploads the
`ui-default-dist` artefact; each environment's UI deploy job downloads that exact build and
applies `war-infra/terraform/ui`, so staging and production serve the same bytes. The app
spec (API only; App Platform serves just `/api/v1`) is applied by a separate app deploy job.
Each side's jobs run only when its own inputs changed, and within an environment the app job
waits for the UI job and goes ahead unless it failed, so the UI is live and smoke-tested
first. There is no edge cache purge: `/assets/*` is `public, max-age=31536000, immutable`
(hashed filenames) and the HTML shell is `max-age=0, must-revalidate`. The asset header rules
live in `war-infra/terraform/ui/asset-headers` (`_headers` syntax), passed to the Worker's
asset config rather than shipped in the build, so they are never served as a file.

**Rollback.** Re-run the deploy job of an earlier successful run (it redeploys that run's
`ui-default-dist` artefact and app spec). The artefact is kept for 14 days; past that, use
Cloudflare's Worker version rollback for the UI, or re-run the pipeline on the old commit.

### Routing and Cloudflare Workers

1. The public hostname reaches the Cloudflare edge (DNS, TLS, WAF, rate limiting).
2. Workers dispatch to origins:
   - `/api/v1/*`: App Platform API (prefix preserved)
   - `/ui/{slug}/*`: custom UI bucket
   - `/media/*`: media bucket (cached, prefix stripped)
3. Internal endpoints (`/api/v1/internal/*`) are blocked on the public hostname and reachable
   only from the scheduler.
4. Everything else (`/*`) goes to the default UI Worker, which serves its static assets and
   returns the shell for SPA routing.

| Worker | Purpose |
|---|---|
| `ui-router.js` | Routes custom UI requests to the shared bucket by slug, returning the shell with 200 for SPA deep links |
| `ui-default.js` | Serves the default UI's static assets and injects link-preview tags on `/wars/:id` |
| `media-router.js` | Caches and serves media, stripping the `/media/` prefix |
| `scheduled-tasks.js` | Invoked by Cloudflare cron; dispatches scheduled operations to internal API endpoints |

Media and the shared custom-UI bucket are served with a one-year cache on content-addressed
keys; the default UI Worker runs code on `/wars/:id` only and serves everything else straight from its assets. Zone-wide rules (in `terraform/shared/`):
block `/api/v1/internal/*` and `/media/originals/*`; one rate-limit rule on `/api/v1/auth/*`
(10 requests per 10 seconds per address and colo, which is all the Cloudflare Free plan
permits per zone); bypass the cache for the API except rankings.

### Scheduled tasks

One task runs, nightly: the `scheduled-tasks.js` Cron Worker calls
`POST /api/v1/internal/close-expired-wars` with `INTERNAL_TASK_TOKEN` (the `x-internal-token`
header). When a task fails the Worker throws, which marks the invocation failed in Cloudflare.
Why a failure is not an outage: spec section 12.8. Alerting on repeated failure is not built
([`TODO/5-monitoring-and-alerting.md`](TODO/5-monitoring-and-alerting.md)).

### Secrets and configuration

Required GitHub Actions secrets (per repository):

| Secret | Used by | Purpose |
|---|---|---|
| `DIGITALOCEAN_ACCESS_TOKEN` | terraform, doctl | DigitalOcean API access |
| `CLOUDFLARE_API_TOKEN` | terraform | Cloudflare API access |
| `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY` | terraform state backend | DigitalOcean Spaces (S3-compatible) |
| `INTERNAL_TASK_TOKEN` | terraform scheduler, API config | Authorises internal endpoints |
| `JWT_SECRET` | API config | Session token signing (substituted into the platform spec) |
| `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`, `TWITTER_CLIENT_SECRET` | API config | OAuth provider client secrets |
| `DOCKERHUB_TOKEN` | API and bootstrap pipelines | Authenticated image pulls (avoids the anonymous rate limit on shared runners) |

The `staging` and `production` GitHub Environments each carry `DO_APP_ID` and
`PUBLIC_BASE_URL`; `production` has the required reviewer. Repository secrets and variables
are also listed in the header of [`app.yml`](.github/workflows/app.yml).

Required GitHub Actions variables:

| Variable | Used by | Purpose |
|---|---|---|
| `CLOUDFLARE_ZONE_ID` | terraform | Cloudflare DNS zone ID |
| `CLOUDFLARE_ACCOUNT_ID` | terraform, scheduler | Cloudflare account ID |
| `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, `FACEBOOK_CLIENT_ID`, `TWITTER_CLIENT_ID` | API config | OAuth provider client IDs |
| `DO_APP_ID` | app pipeline | App Platform app ID, set once per GitHub environment (staging, production) from Terraform's `app_id` output |
| `PUBLIC_BASE_URL` | app pipeline, API config | The environment's public URL (`https://staging.war.tmad.dev` or `https://war.tmad.dev`), set per GitHub environment |
| `DOCKERHUB_USERNAME` | API and bootstrap pipelines | Docker Hub account that owns `DOCKERHUB_TOKEN` |

### Rate limiting

The API's per-address limits (spec 8.4) need the real client address, which depends on how
many reverse-proxy hops sit in front of the API (spec 12.2). The hop count is **not yet
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
   Twitter/X are done; Facebook is not (see [`TODO/12-restore-facebook-sign-in.md`](TODO/12-restore-facebook-sign-in.md)).
3. **Seed the first Admin**, once per environment, after that environment's deploy has run
   (it needs the roles migration) and the owner has signed in once. Nothing else grants the
   role, since granting is Admin-only (spec 6.7). Run from the repository root with dev
   dependencies installed (`npm --prefix war-api ci`):

   ```powershell
   $env:NODE_EXTRA_CA_CERTS = "<that cluster's CA certificate file>"
   $env:DATABASE_URL = doctl databases connection <cluster-id> --format URI --no-header
   if (-not $env:DATABASE_URL) { throw "No connection string returned" }
   npm --prefix war-api run seed-admin -- <voter-id>
   Remove-Item Env:DATABASE_URL, Env:NODE_EXTRA_CA_CERTS
   ```

   - The cluster id comes from `doctl databases list` (`war-staging-pg`, `war-production-pg`).
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
domain. Anything beyond that is not built (spec 12.7; [`TODO/5-monitoring-and-alerting.md`](TODO/5-monitoring-and-alerting.md)).

## Status and specification

[`war-spec.md`](war-spec.md) describes the full design, including parts not yet built, so a
section being present in the spec does not mean it ships; sections marked **Planned** are the
unbuilt ones. Planned work is tracked in [TODO.md](TODO.md).
[`docs/building-a-war-import.md`](docs/building-a-war-import.md) holds instructions written
for an AI assistant that assembles a War import file for the app's Import feature.

## License

Copyright © 2026 Tom Adams. All rights reserved.

This repository is publicly available for viewing purposes only. No
permission is granted to copy, modify, distribute, sublicense, or use this software or its
source code for commercial purposes without prior written permission.
