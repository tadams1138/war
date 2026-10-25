# war

The War platform. Three projects and one specification:

| Directory | What it is |
|---|---|
| `war-api/` | Backend REST API — Node/TypeScript, Fastify, Kysely, PostgreSQL |
| `war-ui-default/` | Default web frontend — React SPA, Vite, Playwright |
| `war-infra/` | Terraform, App Platform specs, Cloudflare Workers, deploy scripts |

`war-spec.md`, at the repo root, is the platform specification.

## Testing

Always include `// Arrange`, `// Act`, and `// Assert` comments in test methods to delineate the three phases.

When prompted to generate tests, present the tests for approval before writing any production code or test infrastructure.

## Code quality

When changing a function, check its cyclomatic complexity. If it exceeds 5, report the function name and complexity value to the user.

## Development

Always use Test Driven Development. Prefer BDD-style acceptance tests over unit tests. Never write production code without first having a failing acceptance test or failing unit test.

Red-Green-Refactor cycle:

1. Write a single failing test (acceptance test preferred; unit test where acceptance is not practical)
2. Write only enough production code to make the test pass
3. Refactor
4. Repeat until there are no more tests to write

Guidance by test type in `war-ui-default`:

- **Acceptance tests** (Playwright): preferred for user-facing behaviour — page loads, navigation, voting interactions, error states. A scenario is a Gherkin scenario in `war-ui-default/features/` whose steps are executed (conventions in the root `README.md`, section "UI acceptance test conventions")
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
- plan: `terraform -chdir=war-infra/terraform/envs/staging plan`
- deploy script tests (render-spec.sh): `bash war-infra/scripts/render-spec.test.sh`

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

## Specs

`war-spec.md` is the single specification and the contract. It describes **what** the
platform does, in implementation-agnostic terms — no payload shapes, no schemas, no folder
structures. Keep it accurate enough to rebuild the project from alone, and keep
implementation detail out of it: that belongs here.

`PROGRESS.md` lists only work not yet done: what is not built, known defects, owner actions
and open decisions. When something ships, delete its entry there and make sure `war-spec.md`
(behaviour) and the README's "Deployment and operations" (how to operate it) describe it.

Executable Gherkin lives with the code that implements it — `war-api/specs/features/`,
`war-ui-default/features/`, `war-infra/specs/features/`. Each has a `pending/` subdirectory
for scenarios with no binding yet. These are test fixture, not a second copy of the spec. A
custom UI (war-spec.md §11) is its own separate repository, not a directory here, so it
keeps its own Gherkin — `.github/workflows/ui-custom.yml` is the reusable pipeline each one
calls.

**The UI's Gherkin is executed.** Every scenario in `war-ui-default/features/*.feature` runs
step by step through playwright-bdd; a step with no definition fails the run. Read
the "UI acceptance test conventions" section of the [`README.md`](README.md) before adding or
changing a UI scenario. Reuse a shared step or add a registry entry before writing a new
step.
