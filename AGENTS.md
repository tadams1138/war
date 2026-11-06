# war

The War platform. Three projects and one specification:

| Directory | What it is |
|---|---|
| `war-api/` | Backend REST API — Node/TypeScript, Fastify, Kysely, PostgreSQL |
| `war-ui-default/` | Default web frontend — React SPA, Vite, Playwright |
| `war-infra/` | Terraform, App Platform specs, Cloudflare Workers, deploy scripts |

`SPEC.md`, at the repo root, is the platform specification.

## Testing

Always include `// Arrange`, `// Act`, and `// Assert` comments in test methods to delineate the three phases.

When prompted to generate tests, present the tests for approval before writing any production code or test infrastructure.

## Code quality

When changing a function, check its cyclomatic complexity. If it exceeds 5, report the function name and complexity value to the user.

## Code comments

Write a comment only to explain what well-named classes, methods and variables cannot: a
non-obvious reason, a constraint, a workaround. Never restate what the code says.

Never put anything in a comment that changes for reasons unrelated to the code beside it:
no SPEC.md section numbers or references to the spec, no TODO item, issue or PR numbers, no
dates or change history. The same applies to test names and Gherkin comments.

## Development

Always use Test Driven Development. Prefer BDD-style acceptance tests over unit tests. Never write production code without first having a failing acceptance test or failing unit test.

Red-Green-Refactor cycle:

1. Write a single failing test (acceptance test preferred; unit test where acceptance is not practical)
2. Write only enough production code to make the test pass
3. Refactor
4. Repeat until there are no more tests to write

Guidance by test type in `war-ui-default`:

- **Acceptance tests** (Playwright): preferred for user-facing behaviour — page loads, navigation, voting interactions, error states. A scenario is a Gherkin scenario in `war-ui-default/features/` whose steps are executed (conventions: "UI acceptance test conventions" below)
- **Unit tests** (Vitest): use for `war-ui-default/src/api/client.ts` logic (401 retry, error mapping) and any pure functions; not for React components that only render API data

## Build and test

All commands run from the repository root. No `cd`.

Each project keeps its own `package.json` and `node_modules`; there is no workspace
tying them together. `npm --prefix <project>` is what reaches into one without
changing directory, so every command below works verbatim from the root.

### war-api

- install: `npm --prefix war-api ci`
- lint: `npm --prefix war-api run lint`
- typecheck: `npm --prefix war-api run typecheck`
- migrate (test DB): `npm --prefix war-api run migrate`
- test (unit + integration + acceptance): `npm --prefix war-api test`
- test (scoped): `npm --prefix war-api test -- -t "<name>"`
- test with coverage (v8; report in `war-api/coverage/`, summary on stdout; fails below the thresholds in `war-api/vitest.config.ts`): `npm --prefix war-api run test:coverage`

Integration and acceptance tests connect via `DATABASE_URL` when set (as CI's
`postgres:16-alpine` service provides) and fall back to a local Testcontainers
Postgres when it is unset.

### war-ui-default

- install: `npm --prefix war-ui-default ci`
- lint: `npm --prefix war-ui-default run lint`
- typecheck: `npm --prefix war-ui-default run typecheck`
- unit test: `npm --prefix war-ui-default test`
- unit test (scoped): `npm --prefix war-ui-default test -- -t "<name>"`
- unit test with coverage (istanbul, into `.nyc-unit/`): `npm --prefix war-ui-default run test:coverage`
- acceptance test: `npm --prefix war-ui-default run test:acceptance`
- acceptance test (scoped): `npm --prefix war-ui-default run test:acceptance -- -g "<name>"`
- acceptance test with coverage (instruments the mock build, into `.nyc_output/`): `npm --prefix war-ui-default run test:acceptance:coverage`
- coverage report (unit, acceptance and merged, in `war-ui-default/coverage/{unit,acceptance,merged}/`; run both coverage commands first): `npm --prefix war-ui-default run coverage:report`
- coverage thresholds (merged statements/functions/lines, and acceptance branches: unit and acceptance use different instrumenters whose branch locations don't line up, so a merged branch figure is meaningless; fails below the thresholds in `package.json`): `npm --prefix war-ui-default run coverage:check`
- build: `npm --prefix war-ui-default run build`

`test:acceptance` runs `bddgen` and then Playwright. Always go through the npm script:
calling `playwright test` directly runs stale generated tests.

### war-infra

- format check: `terraform fmt -check -recursive war-infra`
- validate: `terraform -chdir=war-infra/terraform/envs/staging init -backend=false` then `terraform -chdir=war-infra/terraform/envs/staging validate`
- shared/production validate: repeat init/validate above with `war-infra/terraform/shared` and `war-infra/terraform/envs/production`
- monitoring regression: `node --test war-infra/scripts/monitoring.test.mjs`
- shared database ownership regression: `node --test war-infra/scripts/shared-db.test.mjs`
- plan: `terraform -chdir=war-infra/terraform/envs/staging plan`
- deploy script tests (render-spec.sh): `bash war-infra/scripts/render-spec.test.sh`
- registry pruning script tests (prune-registry.sh): `bash war-infra/scripts/prune-registry.test.sh`
- edge Worker tests: `node --test war-infra/edge/*.test.mjs`
- UI root validate: `terraform -chdir=war-infra/terraform/ui init -backend=false` then `terraform -chdir=war-infra/terraform/ui validate`

`terraform`'s `-chdir` flag and `npm`'s `--prefix` exist precisely so a subdirectory
can be reached without `cd`. Permission rules match on a command's leading text, so
changing directory ahead of `npm test` matches nothing approved for `npm` and prompts
every time.

### workflows

- lint (actionlint with shellcheck, via Docker): `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -color`
  (on Git Bash for Windows, prefix with `MSYS_NO_PATHCONV=1`). Keep the tag in step with
  `.github/workflows/workflows.yml`.

These commands mirror the pipelines in `.github/workflows/`, so local runs match CI.

## Working efficiently

- **Scope test runs while iterating.** During a fix-verify loop, run only the affected spec
  file or `-t`/`-g` name (see the scoped commands above), not the full suite. Run the full
  suite once, right before a commit.
- **Delegate large multi-file refactors to a subagent.** A change touching many files at once
  (a cyclomatic-complexity sweep, a cross-cutting rename) belongs in a subagent, not inline —
  it keeps the raw diffs and test output out of the main conversation.
- **Delegate on the cheapest model that can do the job.** Set the model explicitly on every
  subagent. Use Haiku for mechanical, well-specified edits (renames, doc and label changes,
  small single-file fixes). Use Sonnet for multi-file refactors, test-first feature work, and
  reviews that need judgement. Never leave a subagent on this session's own top-tier model by
  default. A fork inherits this session's model, so use one only when the task needs this
  conversation's context. Resume an interrupted subagent before restarting it on another
  model, since it keeps its context. Verify a subagent's work yourself before committing it:
  run the checks and read the diff, and check a cheaper model's factual claims most closely.
- **Close `claude-in-chrome` tabs as soon as a browser task finishes.** Don't leave automation
  tabs open across turns.

## TODO

Work still to be done is listed in `TODO.md`, with each item's details in
`TODO/<number>-<title>.md`. New feature ideas get the next number (highest + 1) and a
detail file. When an item is fully implemented, describe the behavior in the spec,
remove it from `TODO.md`, delete its detail file, and ask whether to renumber.

## Specs

`SPEC.md` is the single specification and the contract. It describes **what** the
platform does, in implementation-agnostic terms — no payload shapes, no schemas, no folder
structures. Keep it accurate enough to rebuild the project from alone, and keep
implementation detail out of it: that belongs here.

When something ships, make sure `SPEC.md` (behaviour) and the README's "Deployment and
operations" section (how to operate it) describe it.

Executable Gherkin lives with the code that implements it — `war-api/specs/features/`,
`war-ui-default/features/`, `war-infra/specs/features/`. Each has a `pending/` subdirectory
for scenarios with no binding yet. These are test fixture, not a second copy of the spec. A
custom UI (SPEC.md §11.5; registry and shared runtime are TODO #1) is its own separate repository, not a directory here, so it
keeps its own Gherkin — `.github/workflows/ui-custom.yml` is the reusable pipeline each one
calls.

**The UI's Gherkin is executed.** Every scenario in `war-ui-default/features/*.feature` runs
step by step through playwright-bdd. Follow "UI acceptance test conventions" below before adding
or changing a UI scenario. Reuse a shared step or add a registry entry before writing a new
step.

## UI acceptance test conventions

Required before adding or changing a UI scenario. Paths are relative to
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

`test:acceptance` is `bddgen && playwright test`. `bddgen`
regenerates the tests from the feature files into `.features-gen/` (ignored by git, ESLint and
Vitest; never edit it). Never call `playwright test` directly: it runs stale
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
| `support/` | Helpers and the registries behind the parameter types: `pageNames`, `calls`, `lists`, `fields`, `cards`, `bios`, `roles`, `screens`, `providers`; `fakeVideoProviders` (stand-ins for the YouTube and Vimeo scripts and frames, routed in by Playwright so the real player adapters run; `playwright.config.ts` enables routing of the MSW service worker's requests); and `mocking`, `recipes`, `pages`, `editWar`, `results`, `adminRecords`, `adminFixtures`, `exportArchive` |

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
   contradicts `SPEC.md` or cannot be verified in a UI test, and then report it as an open
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
   (commands in "Build and test" above).

### Acceptance pitfalls

- **The keyword is not part of a step's identity.** playwright-bdd matches step text alone, so
  `Given they are on {page}` and `Then they are on {page}` collide. Give a Then its own text
  (`Then {page} is shown`).
- **Vitest must not see `.features-gen/`.** `vitest.config.ts` excludes it.
- **Scenario Outlines** run, but the report titles keep the unsubstituted placeholder in the
  parent describe block.
