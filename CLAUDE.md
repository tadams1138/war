# war

Monorepo for the War platform. Three projects and one set of specifications:

| Directory | What it is |
|---|---|
| `war-api/` | Backend REST API — Node/TypeScript, Fastify, Kysely, PostgreSQL |
| `war-ui-default/` | Default web frontend — React SPA, Vite, Playwright |
| `war-infra/` | Terraform, App Platform specs, Cloudflare Workers, deploy scripts |
| `specs/` | The specifications for all of the above |

## Testing

Always include `// Arrange`, `// Act`, and `// Assert` comments in test methods to delineate the three phases.

When prompted to generate tests, present the tests for approval before writing any production code or test infrastructure.

## Design principles

Always apply the SOLID principles (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion).

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
`cd war-api && npm test` matches nothing approved for `npm` and prompts every time.

These commands mirror the pipelines in `.github/workflows/`, so local runs match CI.

## Specs

The specifications in `specs/` are the contract. Keep them up to date as changes land —
they must stay complete and accurate enough to regenerate the project from alone.

- `specs/war-spec.md` — project overview, goals, roles
- `specs/war-api-spec.md` — REST API, data model, auth, scoring, vote integrity (§15 tracks what is actually built)
- `specs/war-ui-default-spec.md` — default web frontend (§12 tracks what is actually built)
- `specs/war-ui-custom-spec.md` — per-brand custom frontends and their template contract
- `specs/war-infra-spec.md` — hosting, CI/CD, environments (§20 records structural decisions and their causes)

`war-api/specs/features/` and `war-ui-default/features/` hold executable Gherkin — the
subset of the specs' scenarios that actually run in CI. They are test fixture, not a
second copy of the prose, and should not be read as one.
