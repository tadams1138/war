# UI Gherkin migration: from title-bound to executed steps

**Status as of 2026-10-10: in progress, paused. 9 of 17 feature files converted (68 of 279
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
| Converted | `create-war`, `import-war`, `theme-switching`, `share-image`, `error-handling`, `my-wars`, `vote-mode-responsive`, `login-and-auth`, `contestant-images` | 68 | Steps executed by playwright-bdd |
| Not converted | the 8 in the backlog | 211 | Scenario title must equal a Playwright test title |

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
| `tests/acceptance/steps/parameters.ts` | Custom parameter types (`{page}`), registered by `fixtures.ts` |
| `tests/acceptance/steps/<feature>.steps.ts` | One feature's steps, scoped by that feature's tag |
| `tests/acceptance/support/` | Helpers shared by steps and specs: `mocking.ts`, `recipes.ts`, `pages.ts`, `pageNames.ts`, `adminFixtures.ts`, `exportArchive.ts` |
| `tests/bindings/featureBindings.ts` | The title check. Still enforced for every feature *not* in `CONVERTED_FEATURES`; for a converted feature it reports a leftover spec file |
| `.features-gen/` | Generated tests. Ignored by git, ESLint and Vitest. Never edit |

`npm run test:acceptance` is `bddgen && playwright test`. `bddgen` regenerates the tests from
the feature files on every run.

## Conventions

Priorities, in order, when they conflict:

1. **Accuracy.** The Gherkin says precisely what the owner means and what the test does.
2. **Concision.** As few words as say it.
3. **Reuse.** As few step definitions as cover every feature. Reword a step to match an
   existing one when the meaning is the same; generalise a step (a parameter, the `{page}`
   type) rather than adding a near-duplicate.
4. **Code principles.** DRY, SOLID, cyclomatic complexity of 5 or below (ESLint enforces it).

Rules:

1. **Tag each converted feature** with `@<feature-name>` on the line above `Feature:`.
2. **Scope a feature's steps by that tag**: in `<feature>.steps.ts`,
   `const { Given, When, Then } = createBdd(test, { tags: '@<feature-name>' })`, with `test`
   imported from `./fixtures`. A tagged step cannot collide with, or leak into, another feature.
3. **Share a step only when its behaviour is identical everywhere.** Such steps go in
   `shared.steps.ts`, untagged. Before writing a feature step, check `shared.steps.ts` and the
   other `*.steps.ts`: when another feature already has the same step, move it to
   `shared.steps.ts` (with its helpers) rather than duplicate it. Two untagged definitions of
   the same text make `bddgen` fail ("Multiple definitions matched scenario step").
4. **Steps must be true, and the Gherkin is the owner's intent.** When a step claims more than
   the test arranges or checks, strengthen the test: arrange what the Given says, assert what
   the Then claims. Do not reword the Gherkin down to fit a weak test. Reword it only when it
   contradicts `war-spec.md` or cannot be verified in a UI test, and then report the scenario
   as an open question. Where the text merely misdescribes *how* the test works (an
   implementation detail, a wrong name), fix the text. Reword a scenario's title only when
   that says its intent more precisely.
5. **No no-op steps.** A step whose definition does nothing (`Given no voter is
   authenticated`) is not allowed. Say it in the scenario title ("An unauthenticated visitor
   is redirected to log in"), in a subject that implies it (`When a visitor opens ...`), or in
   the feature's free-form description or a `#` comment.
6. **Never lose an assertion.** Every assertion in the old Playwright test must survive in some
   Then step. Strengthening is fine; weakening or dropping is not.
7. **API mocks come before the app boots.** A recipe may carry a `query` (`creator=me`) so it answers only requests with those parameters; the more specific recipe wins. Given steps queue mock responses with
   `world.queue(...)`. The app boots on the first navigation (`a visitor opens {page}`,
   `they open {page}`, `they are on {page}`) or on `Given an authenticated voter`, which then
   signs in. `world.queue` throws after boot, so order the Givens accordingly.
8. **Name pages with `{page}`**, never with a new navigation step. `{page}` matches a name in
   `support/pageNames.ts` (`Home`, `that War's Edit page`, ...) or a quoted literal path. Add
   pages there. "That War" resolves against `world.warId`.
9. **Mark each step's phase** with one comment, as `war-api` does: `// Arrange` in a Given,
   `// Act` in a When, `// Assert` in a Then.
10. **Keep `World` small.** Add a field to the `World` class in `fixtures.ts` only for state
    that a later step really needs (today: `warId`, `matchup`, `listedWars`, `previousPreview`, `requestOutcomes`, `requestedUrls`, and the `booted`/`signedIn` flags).

### Shared vocabulary

`shared.steps.ts` today. Use these before writing new steps:

| Step | Does |
|---|---|
| `Given an authenticated voter` | Boots the app with the queued mocks, opens Home, signs in |
| `Given they are on {page}` / `When they open {page}` / `When a visitor opens {page}` | Boots if needed and navigates (client-side once signed in). "A visitor" means not signed in |
| `Given a War themed {string}` / `Given another War themed {string}` | Queues the War's detail. Wars are numbered `war-1`, `war-2`, ...; "that War" is the latest given |
| `Given the API lists these Wars:` (table: `title`, `status`, optional `share image`) | Queues `GET /wars` and each War's detail. Numbered like the other Wars, so "that War" is the last row. `world.listedWars` keeps them |
| `Given the API accepts a share image upload` / `Then the share image is uploaded to that War` | Queues, and asserts, `POST` of that War's share image |
| `Given a(nother) War` | Queues a default War's detail (numbering as above) |
| `When they reload the page` | Reloads (drops an in-memory session) |
| `Given a {screen} screen` | Sets the viewport to a size named in `support/screens.ts` (`phone`, `desktop`). Add sizes there |
| `Given that War has a matchup to vote on` | Queues the join and next-matchup calls for that War (the default matchup, Left Contestant against Right Contestant, one image each, no bio) |
| `Given the {side} contestant's bio is {string}` / `... is very long` / `Given the {side} contestant has {int} image(s)` | Edit that matchup in place; give them after the matchup step and before the app boots. `{side}` is `left` or `right` |
| `Given the voter's session has expired and cannot be refreshed` | Queues a `401` for every call about the next War (numbered like the other Wars) and a `401` for the refresh |
| `Given the API accepts votes` | Queues a `201` for a vote on that War's matchup |
| `Then the page renders in the {string} theme` | Asserts the `main` element's theme |
| `Then no vote is submitted` | Asserts no `POST` to a vote endpoint was made |
| `Then the matchup is shown` | Asserts the matchup view is visible |
| `Then {page} is shown` / `Then they are redirected to {page}` | Asserts the path, and the page's landmark when it has one |
| `Then they are redirected to the login page with returnTo {page}` | Asserts `/login?returnTo=<path>` |

## Converting one feature

Run every command from the repository root. Never `cd` (see `CLAUDE.md`).

1. Read `features/<name>.feature` and `tests/acceptance/<name>.spec.ts` side by side. For each
   scenario, list what the test arranges, does and asserts.
2. Add `'<name>'` to `CONVERTED_FEATURES` and the `@<name>` tag to the feature file.
3. Write `tests/acceptance/steps/<name>.steps.ts`. Move each test's setup into Given steps, its
   action into When steps and its assertions into Then steps. Reuse steps from
   `shared.steps.ts` where the behaviour is identical, and helpers from
   `tests/acceptance/support/`.
4. Correct the feature's step text wherever it does not match the test (rules 4 and 5).
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
total is still 279 (275 before `error-handling` gained two two-row Scenario Outlines, restoring "any request"; 274 before `contestant-images` turned its on-demand scenario into a two-row Scenario Outline, 273 before `vote-mode-responsive` turned its footer scenario into a two-row Scenario Outline, 272 before `error-handling` split a scenario in two) unless a scenario was deliberately added or removed (say which and why).

Work on a branch, one converted feature per commit. Do not push to `master`; the owner merges.

## Backlog

Smallest first, so the conventions are exercised on easy cases before the large files. Sizes
are the hand-written spec's line count on 2026-10-10.

| Order | Feature | Scenarios | Spec lines | Notes |
|---|---|---|---|---|
| 1 | `vote-mode` | 11 | 267 | |
| 2 | `browse-wars` | 16 | 305 | |
| 3 | `admin-dashboard` | 19 | 375 | Uses `support/adminFixtures.ts` |
| 4 | `admin-wars` | 15 | 395 | Uses `support/adminFixtures.ts` |
| 5 | `navigation` | 20 | 402 | One scenario is a loop over five routes (`test(\`...${x}\`)`); needs a Scenario Outline |
| 6 | `admin-voters` | 27 | 713 | Uses `support/adminFixtures.ts` |
| 7 | `edit-war` | 55 | 1,103 | Largest by scenarios; many dialogs |
| 8 | `war-detail` | 44 | 1,131 | Largest by lines; many layout checks |

Total remaining: 207 scenarios (211 tests, since the `navigation` loop runs five), about
4,656 spec lines. The two converted features grew by about 27% (208 spec lines became 264
lines of steps and helpers), so expect roughly 7,000 to 8,000 lines of steps. That estimate
comes from two small features only.

About 31 scenarios in these files had their Given/When/Then written from the test's title
when the title check was introduced, without reading the test body. Converting a feature
corrects them as a side effect (rules 4 and 5).

## Constraints and pitfalls

- **Always use the npm script.** `npx playwright test` skips `bddgen` and runs stale or missing
  generated tests.
- **Generated titles carry the tag**, for example `... forwards to its Edit page @create-war`,
  and reports point at `.features-gen/...`. `-g "<scenario title>"` still matches.
- **Vitest must not see `.features-gen/`.** `vitest.config.ts` excludes it; without that the
  unit run fails with "test.describe() not expected here".
- **The keyword is not part of a step's identity.** playwright-bdd matches step text alone, so
  `Given they are on {page}` and `Then they are on {page}` collide. Give a Then its own text
  (`Then {page} is shown`).
- **`features/pending/` must never run.** It is not in `CONVERTED_FEATURES`, so `bddgen` does
  not see it.

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
- Scenario Outlines under playwright-bdd are used by `vote-mode-responsive` (the footer scenario) and `contestant-images`, and
  run, but the report titles keep the unsubstituted placeholder in the parent describe block.
  `navigation` will need more of them.
- The spike ran the suite locally through the same npm script CI calls. Check the first CI run
  after any change to the wiring.
