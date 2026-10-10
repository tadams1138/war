# UI Gherkin migration: from title-bound to executed steps

**Status as of 2026-10-10: in progress, paused. 2 of 17 feature files converted (7 of 272
acceptance tests).** Nothing is half-done: every feature is either fully converted or
untouched, and the whole suite passes.

**To resume:** read this file, then convert the next feature in the [backlog](#backlog)
following [Converting one feature](#converting-one-feature). Stop at any feature boundary.

## Why

`war-api` executes every Gherkin step (`@amiceli/vitest-cucumber`). In `war-ui-default` the
steps were prose: a check only compared each scenario *title* with a Playwright test title, so
the Given/When/Then text could say anything. It had drifted. In the first two features
converted, 3 of 7 scenarios had step text that was false (for example "they submit a valid
title" where the test submits nothing), and one Then claimed a War was created while the test
never checked the create call.

The migration makes the UI steps executable with
[playwright-bdd](https://github.com/vitalets/playwright-bdd): it generates Playwright tests
from the feature files and fails on any step that has no definition.

## Current state

| | Features | Acceptance tests | How they are bound |
|---|---|---|---|
| Converted | `create-war`, `import-war` | 7 | Steps executed by playwright-bdd |
| Not converted | the 15 in the backlog | 265 | Scenario title must equal a Playwright test title |

Both kinds run in one `playwright test` invocation and CI needs no change: it calls
`npm run test:acceptance`.

## How it works

All paths are under `war-ui-default/`.

| File | Role |
|---|---|
| `tests/bindings/convertedFeatures.ts` | `CONVERTED_FEATURES`: the one list of converted feature names. Everything else reads it |
| `playwright.config.ts` | Two projects. `bdd` generates tests from the features in `CONVERTED_FEATURES` using the steps in `tests/acceptance/steps/*.ts`. `specs` runs the hand-written `tests/acceptance/*.spec.ts` |
| `tests/acceptance/steps/fixtures.ts` | The `test` object every step file imports, with the per-scenario `world` fixture |
| `tests/acceptance/steps/shared.steps.ts` | Untagged steps whose text means the same in every feature |
| `tests/acceptance/steps/<feature>.steps.ts` | One feature's steps, scoped by that feature's tag |
| `tests/acceptance/support/` | Helpers shared by steps and specs: `mocking.ts`, `recipes.ts`, `pages.ts`, `adminFixtures.ts`, `exportArchive.ts` |
| `tests/bindings/featureBindings.ts` | The title check. Still enforced for every feature *not* in `CONVERTED_FEATURES`; for a converted feature it reports a leftover spec file |
| `.features-gen/` | Generated tests. Ignored by git, ESLint and Vitest. Never edit |

`npm run test:acceptance` is `bddgen && playwright test`. `bddgen` regenerates the tests from
the feature files on every run.

## Conventions

These were settled in the spike. Follow them so the converted features stay uniform.

1. **Tag each converted feature** with `@<feature-name>` on the line above `Feature:`.
2. **Scope a feature's steps by that tag**: in `<feature>.steps.ts`,
   `const { Given, When, Then } = createBdd(test, { tags: '@<feature-name>' })`, with `test`
   imported from `./fixtures`. A tagged step cannot collide with, or leak into, another feature.
3. **Share a step only when its behaviour is identical everywhere.** Such steps go in
   `shared.steps.ts`, untagged. Two untagged definitions of the same text make `bddgen` fail
   ("Multiple definitions matched scenario step"). A tagged definition overrides the shared one
   for scenarios carrying its tag.
4. **Steps must be true.** If the step text does not describe what the test does, fix the text.
   Keep each scenario's title and intent.
5. **Never lose an assertion.** Every assertion in the old Playwright test must survive in some
   Then step. Strengthening is fine; weakening or dropping is not.
6. **API mocks come before the app boots.** Given steps queue mock responses with
   `world.queue(...)`. The shared step `Given an authenticated voter` then seeds them, opens
   the app and signs in. `world.queue` throws if called after that step, so order the Givens
   accordingly.
7. **Mark each step's phase** with one comment, as `war-api` does: `// Arrange` in a Given,
   `// Act` in a When, `// Assert` in a Then.
8. **Keep `World` small.** Add a field to the `World` class in `fixtures.ts` only for state
   that a later step really needs (today: `warId`).
9. Cyclomatic complexity stays at 5 or below; ESLint fails otherwise.

## Converting one feature

Run every command from the repository root. Never `cd` (see `CLAUDE.md`).

1. Read `features/<name>.feature` and `tests/acceptance/<name>.spec.ts` side by side. For each
   scenario, list what the test arranges, does and asserts.
2. Add `'<name>'` to `CONVERTED_FEATURES` and the `@<name>` tag to the feature file.
3. Write `tests/acceptance/steps/<name>.steps.ts`. Move each test's setup into Given steps, its
   action into When steps and its assertions into Then steps. Reuse steps from
   `shared.steps.ts` where the behaviour is identical, and helpers from
   `tests/acceptance/support/`.
4. Correct the feature's step text wherever it does not match the test (convention 4).
5. Delete the spec: `git rm war-ui-default/tests/acceptance/<name>.spec.ts`. If it held helper
   functions other files could use, move them to `tests/acceptance/support/` first.
6. Run the feature's scenarios while iterating:
   `npm --prefix war-ui-default run test:acceptance -- -g "<scenario title>"`.
7. Prove the converted scenarios can fail: change one expected value, see the run go red,
   restore it.
8. Run the full checks:
   ```
   npm --prefix war-ui-default run lint
   npm --prefix war-ui-default run typecheck
   npm --prefix war-ui-default test
   npm --prefix war-ui-default run test:acceptance
   npm --prefix war-ui-default run build
   ```
9. Update the [Current state](#current-state) table and the [backlog](#backlog) in this file,
   and the test coverage row in `PROGRESS.md`.

**Done means:** the spec file is gone, every old assertion has a step, the step text is true,
the red check was seen, all five commands pass with zero lint warnings, and the acceptance
total is still 272 unless a scenario was deliberately added or removed (say which and why).

Work on a branch, one converted feature per commit. Do not push to `master`; the owner merges.

## Backlog

Smallest first, so the conventions are exercised on easy cases before the large files. Sizes
are the hand-written spec's line count on 2026-10-10.

| Order | Feature | Scenarios | Spec lines | Notes |
|---|---|---|---|---|
| 1 | `theme-switching` | 7 | 122 | |
| 2 | `share-image` | 5 | 136 | |
| 3 | `error-handling` | 8 | 143 | |
| 4 | `my-wars` | 10 | 176 | |
| 5 | `vote-mode-responsive` | 6 | 185 | Viewport-dependent |
| 6 | `login-and-auth` | 9 | 190 | |
| 7 | `contestant-images` | 9 | 194 | |
| 8 | `vote-mode` | 11 | 267 | |
| 9 | `browse-wars` | 16 | 305 | |
| 10 | `admin-dashboard` | 19 | 375 | Uses `support/adminFixtures.ts` |
| 11 | `admin-wars` | 15 | 395 | Uses `support/adminFixtures.ts` |
| 12 | `navigation` | 20 | 402 | One scenario is a loop over five routes (`test(\`...${x}\`)`); needs a Scenario Outline |
| 13 | `admin-voters` | 27 | 713 | Uses `support/adminFixtures.ts` |
| 14 | `edit-war` | 55 | 1,103 | Largest by scenarios; many dialogs |
| 15 | `war-detail` | 44 | 1,131 | Largest by lines; many layout checks |

Total remaining: 261 scenarios (265 tests, since the `navigation` loop runs five), about
5,800 spec lines. The two converted features grew by about 27% (208 spec lines became 264
lines of steps and helpers), so expect roughly 7,000 to 8,000 lines of steps. That estimate
comes from two small features only.

About 31 scenarios in these files had their Given/When/Then written from the test's title
when the title check was introduced, without reading the test body. Converting a feature
corrects them as a side effect (convention 4).

## Constraints and pitfalls

- **Always use the npm script.** `npx playwright test` skips `bddgen` and runs stale or missing
  generated tests.
- **Generated titles carry the tag**, for example `... forwards to its Edit page @create-war`,
  and reports point at `.features-gen/...`. `-g "<scenario title>"` still matches.
- **Vitest must not see `.features-gen/`.** `vitest.config.ts` excludes it; without that the
  unit run fails with "test.describe() not expected here".
- **No shared step yet seeds mocks without signing in.** `create-war`'s unauthenticated
  scenario needs no mocks. The first scenario that needs both will need a new shared step that
  calls `useScenario(page, world.recipes)` before the first `page.goto` and sets
  `world.booted`.
- **`features/pending/` must never run.** It is not in `CONVERTED_FEATURES`, so `bddgen` does
  not see it.
- `fixtures.ts` carries one ESLint suppression (`no-empty-pattern`). It is Playwright's own
  fixture signature, not a shortcut.

## Finishing the migration

When `CONVERTED_FEATURES` lists every feature:

1. Point the `bdd` project at `features/*.feature` directly (the glob does not reach
   `features/pending/`) and delete the `specs` project from `playwright.config.ts`.
2. Delete `tests/bindings/` (the title check, its tests, and `convertedFeatures.ts`).
3. Update `CLAUDE.md`, `README.md`, `war-ui-default/README.md` and `PROGRESS.md`, then delete
   this file.

## Not verified

- Traces, videos and the HTML report for the generated tests. They run as native Playwright
  tests, so they are expected to work; nobody has looked.
- Scenario Outlines under playwright-bdd. Neither converted feature has one; `navigation` will
  be the first.
- The spike ran the suite locally through the same npm script CI calls. Check the first CI run
  after any change to the wiring.
