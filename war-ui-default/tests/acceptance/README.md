# UI acceptance tests

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

## Layout

| Path (under `tests/acceptance/`) | Role |
|---|---|
| `steps/fixtures.ts` | The `test` object every step file imports, with the per-scenario `world` fixture |
| `steps/parameters.ts` | The custom parameter types, registered by `fixtures.ts` (below) |
| `steps/shared*.steps.ts` | Untagged steps whose text means the same in every feature: `shared.steps.ts` (general), `shared-nav` (identity menu and name), `shared-calls` (API calls, `{call}`), `shared-lists` (Staff lists, `{list}`), `shared-bio` (rendered bios, `{bio}`), `shared-layout` (where controls sit and how they look) |
| `steps/<feature>.steps.ts` | One feature's steps, scoped by that feature's tag |
| `support/` | Helpers and the registries behind the parameter types: `pageNames`, `calls`, `lists`, `fields`, `cards`, `bios`, `roles`, `screens`, `providers`; and `mocking`, `recipes`, `pages`, `editWar`, `results`, `staffRecords`, `adminFixtures`, `exportArchive` |

## Conventions

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
   merged with it. Given steps queue mock responses with `world.queue(...)`. The app boots on the
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
12. **Time is controlled, never waited for.** A scenario that depends on time passing says so in
    a Given (`the clock is controlled`) and moves it with a When (`30 seconds elapse`); the step
    waits for the page to take in what the elapsed time caused, so the next one cannot race it.

## Parameter types and registries

Add an entry to the registry, not a new step.

| Type | Registry | Examples |
|---|---|---|
| `{page}` | `support/pageNames.ts` (path, landmark, `error` test id) | `Home`, `that War's Edit page`, `"/wars/new"` |
| `{role}` | `support/roles.ts` | `voter`, `Moderator`, `Admin` |
| `{screen}` | `support/screens.ts` | `phone`, `desktop`, `wide`, `narrow landscape`, `narrow portrait` |
| `{side}`, `{card}` | `support/screens.ts`, `support/cards.ts` | `left`; `the left contestant's card`, `the result of "Ada"` |
| `{bio}` | `support/bios.ts` | `the bio preview`, `the bio of "Ada"` |
| `{provider}` | `support/providers.ts` | `Google`, `X` |
| `{list}` | `support/lists.ts` | `the Wars list`, `the vote history` |
| `{call}` | `support/calls.ts` | `remove that War`, `remove the contestant "Ada"` |
| `{field}` | `support/fields.ts` | `title`, `contestant's bio` |
| `{status}`, `{state}` | `parameters.ts` | `draft`, `published`, `closed`; `on`, `off` |

## Shared vocabulary

Use these before writing new steps.

| Step | Does |
|---|---|
| `Given an authenticated {role}` | Boots the app with the queued mocks, opens Home, signs in. The Staff roles queue the matching `GET /auth/me` |
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
| `Then the API has been asked to {call}` (`with:` a table of `{field}` values) / `has not been asked to {call}` / `Then {call} was/were requested {int} time(s)` / `Then nothing has been removed` | Requests made, exactly once / never / counted / no `DELETE` or Staff remove at all |
| `Then an error is shown on {page}` / `for the request to {call}` / `Then a wait is shown, using the supplied delay, not an error` / `Then no error message is shown` | An error is an alert in the place the failed thing was done (the `error` test id of the page or call); a wait is a status (spec section 10.5) |
| `When they select the "<name>" button` or `link` / `Then the "<name>" button` or `link` `is shown` / `hidden` / `enabled` / `disabled` | A control by its label |
| `Then a confirmation is shown` / `no confirmation is shown` / `the confirmation says {string}` / `When they confirm` / `When they cancel` | The alert dialog every dangerous action asks first |
| `Then the message {string} is shown` / `is not shown` / `Then the heading {string} is shown` | Exact visible text / a heading |
| `Then {page} is shown` / `they are redirected to {page}` / `... to the login page with returnTo {page}` | Asserts the path and the page's landmark |
| `When they vote for {string}` / `Then no vote is submitted` / `voting is disabled` / `voting re-enables` / `the matchup is shown` | Vote mode |
| `When they click the next-image arrow on {card}` / `Then {card} offers paging controls` / `{card} shows image {int}` | A card's images, by display order: the active dot, the visible image, its source |
| `Then {bio} says / shows ... / links {string} to {string} / separates its paragraphs ...` | A rendered bio |
| `Then A, B and C sit in one horizontal row, in that order` / `share consistent button styling` / `X is visually set apart from A and B` / `the "X" button` or `link` `is above A and B` / `is centered on the page` / `is larger than an ordinary button` | Where controls sit and how they look, by label |
| `Then a zip of that War's definition downloads` | Export |
| `When they select {string} in {list}` / `filter {list} by {string}` / `search {list} for {string}` / `Then {list} shows only / shows, in order:` / `was last requested for ...` | Staff lists |
| `When they open the identity menu` / `select {string} from the identity menu` / `Then the identity menu links ...` / `the navigation shows the name {string}` / `they are signed out` / `signed in` | The header |
| `When they choose {string} from the sort menu` / `Then the sort menu shows {string}` / `the search box is shown` / `an empty state is shown` / `a link to create a War is shown` / `the page renders in the {string} theme` | Lists and themes |

## Adding or changing a scenario

1. Write the scenario in `features/<name>.feature`. Reuse the vocabulary above.
2. Add steps to `steps/<name>.steps.ts` (or move one to a shared file, rule 3).
3. Run it: `npm --prefix war-ui-default run test:acceptance -- -g "<scenario title>"`.
4. Prove it can fail: change one expected value, or break the app behaviour it covers, see the
   run go red, restore it.
5. Run lint (zero warnings), typecheck, unit tests, the full acceptance suite and the build
   (commands in the root `CLAUDE.md`).

## Pitfalls

- **The keyword is not part of a step's identity.** playwright-bdd matches step text alone, so
  `Given they are on {page}` and `Then they are on {page}` collide. Give a Then its own text
  (`Then {page} is shown`).
- **Vitest must not see `.features-gen/`.** `vitest.config.ts` excludes it.
- **Scenario Outlines** run, but the report titles keep the unsubstituted placeholder in the
  parent describe block.
