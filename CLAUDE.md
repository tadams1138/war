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
changing directory ahead of `npm test` matches nothing approved for `npm` and prompts
every time.

### war-infra tools

`war-infra/tools/` holds small self-contained checkers with their own
`package.json`. They are not part of any deployed artifact.

- install: `npm --prefix war-infra/tools/concurrency-groups ci`
- test: `npm --prefix war-infra/tools/concurrency-groups test`
- run the guard: `npm --prefix war-infra/tools/concurrency-groups run check`

These commands mirror the pipelines in `.github/workflows/`, so local runs match CI.

## Specs

`specs/war-spec.md` is the single specification and the contract. It describes **what** the
platform does, in implementation-agnostic terms — no payload shapes, no schemas, no folder
structures. Keep it accurate enough to rebuild the project from alone, and keep
implementation detail out of it: that belongs here.

`PROGRESS.md` records what is actually built, what is not, known defects, and open
questions. Update it when something ships.

Executable Gherkin lives with the code that implements it — `war-api/specs/features/`,
`war-ui-default/features/`, `war-infra/specs/features/`, `war-ui-custom/specs/features/`.
Each has a `pending/` subdirectory for scenarios with no binding yet. These are test
fixture, not a second copy of the spec.

## Project layout

Implementation detail, not specification — a rewrite in another language would look
different.

```
war-api/          Backend service
  src/
    auth/           Provider sign-in, token issuance
    oauth/          OAuth 2.1 authorization/resource server role
    mcp/
      allowedActions.ts   Service-layer allowlist — the only import path tools/ may use
      tools/              One MCP tool handler per file
    wars/ contestants/ matchups/ votes/ rankings/ ui-registry/
  db/migrations/    Ordered SQL migrations
  specs/features/   Executable Gherkin
  test/

war-ui-default/   React SPA
  src/
    pages/ components/ api/ auth/ router/
  features/         Executable Gherkin
  tests/acceptance/ Playwright bindings

war-infra/        Terraform, platform specs, edge functions, deploy scripts
  terraform/{modules,shared,envs}/
  platform/         Per-environment application specs
  edge/             Edge functions
  tools/            Self-contained CI checkers

.github/workflows/  Pipelines (GitHub reads workflows only from the repo root)
```

## Current stack

Also implementation detail. The spec states requirements by role; these are what currently
fills them.

| Concern | Choice |
|---|---|
| API runtime | Node.js 24.x, TypeScript |
| API framework | Fastify — JSON Schema per route, and the OpenAPI document generates from those same schemas |
| Database | PostgreSQL, via Kysely; migrations by `node-pg-migrate` |
| Sign-in | `openid-client`; tokens via `jose` |
| Images | `sharp` |
| Object storage | S3-compatible SDK |
| MCP | `@modelcontextprotocol/sdk` — its `server/auth` module supplies the OAuth wire protocol; `@fastify/express` bridges those Express handlers |
| API testing | Vitest, Supertest, Testcontainers (a real database, never a mock) |
| UI | React, Vite, React Router, Tailwind |
| UI types | `openapi-typescript`, generated from the API's document |
| UI testing | Vitest + Testing Library; Playwright + MSW for acceptance |
| Edge | Cloudflare — DNS, TLS, CDN, WAF, rate limiting, Workers, cron |
| Application platform | DigitalOcean App Platform |
| Database / storage / registry | DigitalOcean Managed PostgreSQL, Spaces, DOCR |
| IaC | Terraform, state in Spaces |
| CI/CD | GitHub Actions |
| Error tracking | Sentry |
