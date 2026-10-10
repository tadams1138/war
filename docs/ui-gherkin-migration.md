# UI Gherkin migration: from title-bound to executed steps

**Status: COMPLETE (2026-10-10).** Every feature file executes its steps (290 acceptance
tests), the title-binding scaffolding (`tests/bindings/`, the `specs` Playwright project, the
`CONVERTED_FEATURES` list) is gone, and the conventions, the rules and the shared vocabulary
now live in `war-ui-default/tests/acceptance/README.md`. This file is a historical record of the
migration and is kept only for review; the sections below describe the intermediate state and
are no longer maintained.

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
| Converted | `create-war`, `import-war`, `theme-switching`, `share-image`, `error-handling`, `my-wars`, `vote-mode-responsive`, `login-and-auth`, `contestant-images`, `vote-mode`, `browse-wars`, `admin-dashboard`, `admin-wars`, `navigation`, `admin-voters`, `edit-war`, `war-detail` | 290 | Steps executed by playwright-bdd |
| Not converted | none | 0 | |

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
| `tests/acceptance/steps/shared-nav.steps.ts` | Untagged steps for the header's identity menu and name |
| `tests/acceptance/steps/shared-calls.steps.ts` | Untagged steps for the API calls the app makes, named with `{call}` (`support/calls.ts`) |
| `tests/acceptance/steps/shared-lists.steps.ts` | Untagged steps for the Staff lists, named with `{list}` (`support/lists.ts`) |
| `tests/acceptance/steps/parameters.ts` | Custom parameter types (`{page}`, `{role}`, `{call}`, `{field}`, `{status}`, ...), registered by `fixtures.ts` |
| `tests/acceptance/steps/<feature>.steps.ts` | One feature's steps, scoped by that feature's tag |
| `tests/acceptance/support/` | Helpers shared by steps and specs: `mocking.ts`, `recipes.ts`, `pages.ts`, `pageNames.ts`, `lists.ts`, `calls.ts`, `fields.ts`, `editWar.ts`, `staffRecords.ts`, `adminFixtures.ts`, `exportArchive.ts` |
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
7. **API mocks come before the app boots.** A recipe may carry a `query` (`creator=me`) so it answers only requests with those parameters; the more specific recipe wins. A response with `echoRequest` answers with the JSON body the request carried (a PUT that returns what it was asked to set). Given steps queue mock responses with
   `world.queue(...)`. The app boots on the first navigation (`a visitor opens {page}`,
   `they open {page}`, `they are on {page}`) or on `Given an authenticated voter`, which then
   signs in. `world.queue` throws after boot, so order the Givens accordingly.
8. **Name pages with `{page}`**, never with a new navigation step. `{page}` matches a name in
   `support/pageNames.ts` (`Home`, `that War's Edit page`, ...) or a quoted literal path. Add
   pages there. "That War" resolves against `world.warId`.
9. **Mark each step's phase** with one comment, as `war-api` does: `// Arrange` in a Given,
   `// Act` in a When, `// Assert` in a Then.
10. **Keep `World` small.** Add a field to the `World` class in `fixtures.ts` only for state
    that a later step really needs (today: `warId`, `voterId`, `matchupResponse` (and its `matchupCalls`), `listedWars`, `previousPreview`, `requestOutcomes`, `requestedUrls`, `retryAfterSeconds`, `downloads`, and the `booted`/`signedIn` flags).

### Shared vocabulary

`shared.steps.ts` today. Use these before writing new steps:

| Step | Does |
|---|---|
| `Given an authenticated {role}` | Boots the app with the queued mocks, opens Home, signs in. `{role}` is `voter`, `Staff member` (signed in as a Moderator), `Moderator` or `Admin` (`support/roles.ts`); the others queue the matching `GET /auth/me` |
| `Given they are on {page}` / `When they open {page}` / `When a visitor opens {page}` | Boots if needed and navigates (client-side once signed in). "A visitor" means not signed in |
| `Given a War themed {string}` / `Given another War themed {string}` | Queues the War's detail. Wars are numbered `war-1`, `war-2`, ...; "that War" is the latest given |
| `Given the API lists these Wars:` (table: `title`, `status`, optional `category`, `contestants`, `share image`) | Queues `GET /wars` and each War's detail. Numbered like the other Wars, so "that War" is the last row. `world.listedWars` keeps them |
| `Given the API accepts a share image upload` / `Then the share image is uploaded to that War` | Queues, and asserts, `POST` of that War's share image |
| `Given a(nother) War` / `Given a(nother) {status} War` | Queues a default War's detail (numbering as above); `{status}` is `draft`, `published` or `closed` (a plain `a War` is published). It is the War as its creator sees it (`GET /wars/:id`) |
| `Given that War has contestants:` (table: `name`, optional `bio`, `images` (default 1), `votes` (default 0)) | Replaces that War's default contestant. A contestant is addressed by its name (`support/editWar.ts`), its images by position |
| `When they select the {string} button` | Clicks the button with that name |
| `When they reload the page` | Reloads (drops an in-memory session) |
| `Given a {screen} screen` | Sets the viewport to a size named in `support/screens.ts` (`phone`, `desktop`). Add sizes there |
| `Given that War has a matchup to vote on` | Queues the join and next-matchup calls for that War (the default matchup, Left Contestant against Right Contestant, one image each, no bio, 0 of 10 decided). `world.matchupCalls` holds the next-matchup responses in call order |
| `Given the {side} contestant is named {string}` / `... 's bio is {string}` / `... is very long` / `Given the {side} contestant has {int} image(s)` | Edit the latest matchup given, in place; give them after its matchup step and before the app boots. `{side}` is `left` or `right` |
| `Given the voter's session has expired and cannot be refreshed` | Queues a `401` for every call about the next War (numbered like the other Wars) and a `401` for the refresh |
| `Given the API accepts votes` | Queues a `201` for a vote on that War's matchup |
| `When they choose {string} from the sort menu` / `Then the sort menu shows {string}` / `Then the search box is shown` | The Home and My Wars list controls |
| `Then an empty state is shown` / `Then a link to create a War is shown` | The empty state, and its "Start a War" link |
| `Then the heading {string} is shown` | A heading with that name is visible |
| `Then the page renders in the {string} theme` | Asserts the `main` element's theme |
| `When they vote for {string}` | Clicks that contestant's card |
| `When they click the next-image arrow on the {side} contestant's card` / `Then the {side} contestant's card shows image {int}` | Pages a card with its arrow; asserts the active dot and a visible active image |
| `Then they are signed out` / `Then they are signed in` | Signed out: the nav offers Log in (to the login page) and no identity or menu. Signed in: it offers an identity and no Log in |
| `Then no error message is shown` | No vote error and no alert |
| `When they open the identity menu` / `When they select {string} from the identity menu` | The header's identity menu (always called that) |
| `Then the identity menu links {string} to {page}` / `Then the identity menu offers no {string} link` / `Then the navigation shows the name {string}` | The menu's items, the identity control's label |
| `Given the API creates an empty draft War` | Queues the create call and the draft it makes; "that War" becomes that draft (`CREATED_WAR_ID`) |
| `Then no vote is submitted` | Asserts no `POST` to a vote endpoint was made |
| `Then voting is disabled` / `Then voting re-enables( once that delay has passed)` | Both cards of the pair are busy and disabled / enabled again |
| `Then the matchup is shown` | Asserts the matchup view is visible |
| `Then {page} is shown` / `Then they are redirected to {page}` | Asserts the path, and the page's landmark when it has one. `that War's results page` is `that War's detail page`; `the Admin Dashboard` and `that War's Staff detail page` are the Staff pages |
| `Then they are redirected to the login page with returnTo {page}` | Asserts `/login?returnTo=<path>` |
| `Then a confirmation is shown` / `Then no confirmation is shown` / `Then the confirmation says {string}` / `When they confirm` / `When they cancel` | The alert dialog every dangerous action asks first (Kill switch, Remove War, ...) |
| `Then the "<name>" button is shown` / `is hidden` / `is enabled` / `is disabled` | A button with that name is visible / absent / visible and enabled / visible and disabled |
| `Then the message {string} is shown` / `is not shown` | That exact text is visible (an error, usually) / absent |
| `Then an error is shown on {page}` / `Then an error is shown for the request to {call}` / `Then a wait is shown, using the supplied delay, not an error` | Every error is an alert and a wait is a status (spec §10.5). The error is the one in the place the failed thing was done: the `error` test id of the page (`support/pageNames.ts`) or of the call (`support/calls.ts`). The wait's delay is `world.retryAfterSeconds` |
| `When they select {string} in {list}` / `When they filter {list} by {string}` / `When they search {list} for {string}` | A Staff list row's link, its status filter (by label), its search box. `{list}` is a name in `support/lists.ts`: `the Wars list`, `the Voters list`, `the vote history`, `the Voter's Wars`, `the unaddressed reports queue`, `the moderation log` |
| `Given the API accepts a request to {call}` / `refuses a request to {call}` / `rejects a request to {call}`( `, saying {string}`) / `fails a request to {call} with a server error` / `rate limits a request to {call} for {int} second(s)` / `Given the target of a request to {call} does not exist` | Queues the answer to a write. `{call}` is a name in `support/calls.ts` (`remove that War`, `suspend that Voter`, `save that War's details`, `publish that War`, ...). A call about one contestant ends with its name in quotes (`remove the contestant "Ada"`, `add an image to the contestant "Ada"`). Accepting also queues how the changed record then reads (a suspended Voter, a removed War, a War with another image) as the next answer of its detail; a PATCH answers with the record merged with the request (`mergeRequest`) |
| `Then the API has been asked to {call}` / `... {call} with:` (table: a `{field}` and the value it was given) / `has not been asked to {call}` / `Then {call} was/were requested {int} time(s)` | Exactly once, with the body the call carries (and the fields given) / never / a read counted (`that War's Staff detail`, `that War's reports`, `that Voter's Staff detail`, `the current Voter's identity`) |
| `Then nothing has been removed` | No `DELETE` and no Staff `POST .../remove` was made |
| `Then no Staff detail is shown` | Neither Staff detail page (a War's, a Voter's) rendered |
| `Then {list} shows only {string}` / `Then {list} shows, in order:` (one name per row) | The rows' first links, exactly |
| `Then {list} was last requested for the {string} filter` / `was requested {int} time(s)` / `was searched exactly once, for {string}` / `Then the next page of {list} was requested from where the first page ended` | What the list asked the API for |

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
total is still 286 (281 before `navigation`'s footer scenario became a six-row Scenario Outline; 279 before `contestant-images` turned its swipe scenario into a three-row Scenario Outline; 275 before `error-handling` gained two two-row Scenario Outlines, restoring "any request"; 274 before `contestant-images` turned its on-demand scenario into a two-row Scenario Outline, 273 before `vote-mode-responsive` turned its footer scenario into a two-row Scenario Outline, 272 before `error-handling` split a scenario in two) unless a scenario was deliberately added or removed (say which and why).

Work on a branch, one converted feature per commit. Do not push to `master`; the owner merges.

## Backlog

Smallest first, so the conventions are exercised on easy cases before the large files. Sizes
are the hand-written spec's line count on 2026-10-10.

| Order | Feature | Scenarios | Spec lines | Notes |
|---|---|---|---|---|
| 1 | `war-detail` | 44 | 1,131 | Largest by lines; many layout checks |

Total remaining: 44 scenarios, about 1,131 spec lines. The two converted features grew by about 27% (208 spec lines became 264
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

## Finishing the migration (done)

When `CONVERTED_FEATURES` listed every feature:

1. Point the `bdd` project at `features/*.feature` directly (the glob does not reach
   `features/pending/`) and delete the `specs` project from `playwright.config.ts`.
2. Delete `tests/bindings/` (the title check, its tests, and `convertedFeatures.ts`).
3. Update `CLAUDE.md`, `README.md`, `war-ui-default/README.md` and `PROGRESS.md`, then delete
   this file (kept for review instead).

## Not verified

- Traces, videos and the HTML report for the generated tests. They run as native Playwright
  tests, so they are expected to work; nobody has looked.
- Scenario Outlines under playwright-bdd are used by `vote-mode-responsive` (the footer scenario), `contestant-images` and `navigation`, and
  run, but the report titles keep the unsubstituted placeholder in the parent describe block.
- The spike ran the suite locally through the same npm script CI calls. Check the first CI run
  after any change to the wiring.
