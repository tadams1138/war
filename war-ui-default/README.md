# war-ui-default

The default web UI for the War platform: a React single-page app (Vite, TypeScript) served as static files. It talks to `war-api` over REST; behaviour is defined in `../war-spec.md` (§10).

## Scripts

Run from the repository root with `npm --prefix war-ui-default <script>`.

| Script | What it does |
|---|---|
| `dev` | Vite dev server against a real `war-api` (`VITE_API_BASE_URL`, default `/api/v1`) |
| `dev:mock` | Dev server with the API mocked in the browser (MSW); no backend needed |
| `build` | Typecheck, then production build to `dist/` |
| `build:mock` | Production-style build with the MSW mocks enabled (used by the acceptance suite) |
| `lint` | ESLint, including cyclomatic complexity (max 5) and the React hooks rules |
| `typecheck` | `tsc --strict` over `src` and over tests and config files |
| `test` | Vitest unit tests |
| `test:acceptance` | Generates tests from the converted feature files (`bddgen`), then runs all Playwright acceptance tests (builds and serves the mock build) |
| `generate:api` | Regenerate `src/api/generated/schema.d.ts` from `war-api`'s OpenAPI document |

## Mock mode

`--mode mock` sets `VITE_API_MOCKING=enabled` (`.env.mock`). `src/main.tsx` then starts an MSW service worker with the baseline handlers in `src/mocks/handlers.ts`. `mock-sw/mockServiceWorker.js` is served only in mock mode, so it is never part of a real deployment's `dist/`.

## Tests

- `src/**` unit tests (Vitest): `api/client.ts` logic, pure helpers, hooks.
- `features/*.feature`: Gherkin scenarios for user-visible behaviour; `features/pending/` holds scenarios with no binding yet.
- Acceptance tests load the mock build and set up each scenario with data-driven MSW recipes (`tests/acceptance/support/mocking.ts`, `src/mocks/scenarios.ts`). Shared helpers live in `tests/acceptance/support/`.
- Scenarios bind to tests in one of two ways while the suite is migrated to executed Gherkin steps (see [`../docs/ui-gherkin-migration.md`](../docs/ui-gherkin-migration.md)):
  - **Converted features** (listed in `tests/bindings/convertedFeatures.ts`): playwright-bdd generates the tests from the feature file and runs the step definitions in `tests/acceptance/steps/`. A step with no definition fails the run.
  - **Other features**: every scenario title in `features/<name>.feature` must equal the title of exactly one test in `tests/acceptance/<name>.spec.ts` (and vice versa); `tests/bindings/featureBindings.test.ts` fails `npm test` on any drift.
- Always run acceptance tests through `npm run test:acceptance`. Calling `playwright test` directly skips generation.

## Layout

- `src/api`: typed client, error mapping, generated schema
- `src/pages`, `src/components`: routes and shared UI
- `src/hooks`: shared hooks (async resources, cursor paging, debouncing)
- `src/admin`, `src/editWar`, `src/vote`, `src/rankings`, `src/export`, `src/import`: feature code
- `src/theme`: the three visual themes and the theme context
- `src/mocks`: MSW handlers and fixtures for mock mode and tests
