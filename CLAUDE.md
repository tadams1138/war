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

- **Acceptance tests** (Playwright): preferred for user-facing behaviour — page loads, navigation, voting interactions, error states
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

Integration and acceptance tests connect via `DATABASE_URL` when set (as CI's
`postgres:16-alpine` service provides) and fall back to a local Testcontainers
Postgres when it is unset.

### war-ui-default

- install: `npm --prefix war-ui-default ci`
- lint: `npm --prefix war-ui-default run lint`
- typecheck: `npm --prefix war-ui-default run typecheck`
- unit test: `npm --prefix war-ui-default test`
- unit test (scoped): `npm --prefix war-ui-default test -- -t "<name>"`
- acceptance test: `npm --prefix war-ui-default run test:acceptance`
- acceptance test (scoped): `npm --prefix war-ui-default run test:acceptance -- -g "<name>"`
- build: `npm --prefix war-ui-default run build`

### war-infra

- format check: `terraform fmt -check -recursive war-infra`
- validate: `terraform -chdir=war-infra/terraform/envs/staging init -backend=false` then `terraform -chdir=war-infra/terraform/envs/staging validate`
- plan: `terraform -chdir=war-infra/terraform/envs/staging plan`

`terraform`'s `-chdir` flag and `npm`'s `--prefix` exist precisely so a subdirectory
can be reached without `cd`. Permission rules match on a command's leading text, so
changing directory ahead of `npm test` matches nothing approved for `npm` and prompts
every time.

### war-infra tools

`war-infra/tools/` holds small self-contained checkers with their own
`package.json`. They are not part of any deployed artifact.

- install: `npm --prefix war-infra/tools/concurrency-groups ci`
- test: `npm --prefix war-infra/tools/concurrency-groups test`
- run the guard: `npm --prefix war-infra/tools/concurrency-groups run check`

These commands mirror the pipelines in `.github/workflows/`, so local runs match CI.

## Working efficiently

- **Scope test runs while iterating.** During a fix-verify loop, run only the affected spec
  file or `-t`/`-g` name (see the scoped commands above), not the full suite. Run the full
  suite once, right before a commit.
- **Fork for large multi-file refactors.** A change touching many files at once (a
  cyclomatic-complexity sweep, a cross-cutting rename) belongs in a forked subagent, not
  inline — it keeps the raw diffs and test output out of the main conversation.
- **Close `claude-in-chrome` tabs as soon as a browser task finishes.** Don't leave automation
  tabs open across turns.

## Specs

`war-spec.md` is the single specification and the contract. It describes **what** the
platform does, in implementation-agnostic terms — no payload shapes, no schemas, no folder
structures. Keep it accurate enough to rebuild the project from alone, and keep
implementation detail out of it: that belongs here.

`PROGRESS.md` records what is actually built, what is not, known defects, and open
questions. Update it when something ships.

Executable Gherkin lives with the code that implements it — `war-api/specs/features/`,
`war-ui-default/features/`, `war-infra/specs/features/`, `war-ui-custom/specs/features/`.
Each has a `pending/` subdirectory for scenarios with no binding yet. These are test
fixture, not a second copy of the spec.

