# Single-Page War Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-step Create War wizard (Metadata → Contestants → Review/Activate) with a single flow: "Create War" creates an empty draft immediately and forwards to that draft's Edit page, which now also carries theme editing and an Activate button. There is no longer a separate create/edit/review process — one page does everything a draft needs.

**Architecture:** A War no longer requires a title at the API level (it's identified by its id, a GUID) — `POST /wars` accepts an empty body and creates an untitled draft. The UI's `/wars/new` route becomes a thin trigger: on mount it POSTs an empty payload and redirects straight to `/wars/:id/edit`. `EditWar.tsx` (already built) gains a theme field (moved off the now-deleted wizard) and an Activate button, client-side disabled until the War meets the API's own activation rule (≥2 contestants, each with media) and otherwise surfacing the API's validation messages verbatim on failure — exactly mirroring what the wizard's Review step used to do. The wizard's four component files and its state machine are deleted outright.

**Tech Stack:** war-api: Fastify + Kysely + raw-SQL migrations, Vitest + Supertest + `@amiceli/vitest-cucumber` (Testcontainers Postgres, migrations auto-applied by the test harness). war-ui-default: React + Vite, Vitest + Testing Library for units, Playwright + MSW for acceptance, types generated from war-api's OpenAPI document via `npm run generate:api`.

**Spec:** `war-spec.md` §4 (Domain Model — War table, Title row), §6.1 (Wars — Creation, Activation), §10.1 (Routes), §10.4 ("Create War", "My Wars", "Editing a draft", "Activate"). Already written and committed as of this plan — read it alongside this plan for the *why* behind each step.

## Global Constraints

- FluentAssertions is not used in this repo (TypeScript throughout) — not applicable.
- Every war-api test uses Arrange/Act/Assert comments; every war-ui-default Playwright acceptance test follows the same convention already used in this repo's existing specs.
- Red-Green-Refactor: write the failing test, watch it fail for the right reason, write the minimal code to pass, watch it pass, then commit. Every task below is already sequenced that way.
- After changing any function, check its cyclomatic complexity; report to the user if it exceeds 5. `createWarForVoter`'s validation block and `patchWar`'s are both worth checking after their edits in Tasks 1 and 2.
- Apply SOLID: `activate` stays its own action in `useEditWar` (single responsibility alongside `saveMetadata`/`saveContestant`), not folded into either of those.
- All commands run from the repository root per this repo's CLAUDE.md — `npm --prefix war-api ...` / `npm --prefix war-ui-default ...`, never `cd`.
- Never write Claude/session attributions into commit messages (user's global CLAUDE.md).

---

## File Structure

**war-api (new/modified):**
- `db/migrations/20260107000000_war_title_optional.sql` — new: drops `wars.title`'s `NOT NULL`
- `src/db/types.ts` — modified: `WarsTable.title` → `string | null`
- `src/wars/warsRepository.ts` — modified: `War.title`, `CreateWarInput.title`, `WarPatch.theme`, `updateWar`
- `src/wars/warsService.ts` — modified: `CreateWarInput.title` (optional/nullable), `createWarForVoter` validation; `PatchWarInput.theme`, `patchWar` validation
- `src/wars/warPresenter.ts` — modified: `WarSummaryView.title` → `string | null`, `warSummaryProperties.title` schema
- `src/wars/routes.ts` — modified: POST `/wars` handler's `title`; PATCH `/wars/:id` body schema gains `theme`
- `specs/features/war-creation.feature` + `test/features/war-creation.steps.ts` — modified: "A title is required" → "A title is optional"
- `specs/features/war-lifecycle.feature` + `test/features/war-lifecycle.steps.ts` — modified: new theme-PATCH scenario

**war-ui-default (new/modified):**
- `openapi.json`, `src/api/generated/schema.d.ts` — regenerated, not hand-edited
- `src/api/client.ts` — modified: `CreateWarPayload.title` becomes optional
- `src/pages/CreateWar.tsx` — rewritten: instant-create trigger, no wizard
- `src/createWar/useCreateWarWizard.ts`, `MetadataStep.tsx`, `ContestantsStep.tsx`, `ReviewStep.tsx` — deleted
- `features/create-war.feature` — rewritten
- `tests/acceptance/create-war.spec.ts` — rewritten
- `tests/acceptance/navigation.spec.ts` — modified: one reachability row now targets Edit War instead of the (now transitional) Create War page; the identity-menu navigation test now follows through to Edit War
- `tests/acceptance/theme-switching.spec.ts` — modified: removes the Create-War-page theme test (redundant with Home's own "arcade by default, switchable" coverage now that the page is transitional)
- `src/editWar/EditWarMetadataForm.tsx` — modified: theme `<select>`
- `src/editWar/useEditWar.ts` — modified: `activate` action, `activating`/`activateDetails` state
- `src/pages/EditWar.tsx` — modified: Activate button + gating, title fallback in the `<h1>`
- `tests/acceptance/edit-war.spec.ts` — modified: new tests for theme and Activate

**PROGRESS.md** — modified (doc, last task)

---

### Task 1: War title becomes optional at creation

**Files:**
- Create: `war-api/db/migrations/20260107000000_war_title_optional.sql`
- Modify: `war-api/src/db/types.ts:28`
- Modify: `war-api/src/wars/warsRepository.ts` (`War` interface, `CreateWarInput` interface, `toWar`)
- Modify: `war-api/src/wars/warsService.ts:22-93` (`CreateWarInput`, `createWarForVoter`)
- Modify: `war-api/src/wars/warPresenter.ts` (`WarSummaryView.title`, `warSummaryProperties.title`)
- Modify: `war-api/src/wars/routes.ts:87-109` (POST `/wars` handler)
- Modify: `war-api/specs/features/war-creation.feature:9-13`
- Modify: `war-api/test/features/war-creation.steps.ts:54-75`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `War.title: string | null`, `CreateWarOutcome` unchanged in shape. Task 3 (regen) depends on `warPresenter.ts`'s schema change landing here.

- [ ] **Step 1: Update the feature scenario to expect success, not 422**

Edit `war-api/specs/features/war-creation.feature`, replacing the "A title is required" scenario:

```gherkin
  Scenario: A title is optional
    Given an authenticated voter
    When they POST to /api/v1/wars with no title
    Then a new War is created in "draft" status
    And its title is null
```

- [ ] **Step 2: Update the step definitions to match**

In `war-api/test/features/war-creation.steps.ts`, replace the `'A title is required'` scenario block (lines 54-75) with:

```typescript
  Scenario('A title is optional', ({ Given, When, Then, And }) => {
    let creatorId: string;
    let response: request.Response;

    Given('an authenticated voter', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
    });

    When('they POST to /api/v1/wars with no title', async () => {
      response = await authedPost(creatorId, '/api/v1/wars');
    });

    Then('a new War is created in "draft" status', () => {
      expect(response.status).toBe(201);
      expect(response.body.status).toBe('draft');
    });

    And('its title is null', () => {
      expect(response.body.title).toBeNull();
    });
  });
```

- [ ] **Step 3: Run the feature to verify it fails**

Run: `npm --prefix war-api test -- -t "A title is optional"`
Expected: FAIL — current `createWarForVoter` still rejects a missing title with a 422, so `response.status` is 422, not 201.

- [ ] **Step 4: Migration — drop `wars.title`'s NOT NULL**

Create `war-api/db/migrations/20260107000000_war_title_optional.sql`:

```sql
-- Up Migration

ALTER TABLE wars ALTER COLUMN title DROP NOT NULL;

-- Down Migration

ALTER TABLE wars ALTER COLUMN title SET NOT NULL;
```

- [ ] **Step 5: Widen the Kysely column type**

In `war-api/src/db/types.ts`, change line 28:

```typescript
  title: string | null;
```

- [ ] **Step 6: Widen `War` and `CreateWarInput` in the repository**

In `war-api/src/wars/warsRepository.ts`, change the `War` interface's `title` field:

```typescript
export interface War {
  id: string;
  creatorId: string | null;
  title: string | null;
  category: string | null;
  status: string;
  visibility: string;
  mediaMode: string;
  theme: string;
  contestantSchema: ContestantSchemaField[];
  endsAt: Date | null;
  createdAt: Date;
}
```

And the `CreateWarInput` interface's `title` field, right below it:

```typescript
export interface CreateWarInput {
  creatorId: string;
  title: string | null;
  category: string | null;
  visibility: string;
  mediaMode: string;
  theme: string;
  contestantSchema: ContestantSchemaField[];
  endsAt: Date | null;
}
```

`toWar` and `createWar` need no change — both already pass `title` straight through, and `row.title`/`input.title` now simply carry `null` when the column does.

- [ ] **Step 7: Relax validation and normalize in `createWarForVoter`**

In `war-api/src/wars/warsService.ts`, change `CreateWarInput.title`:

```typescript
export interface CreateWarInput {
  creatorId: string;
  title?: string | null;
  category?: string | null;
  visibility?: string;
  mediaMode?: string;
  theme?: string;
  contestantSchema?: unknown;
  endsAt?: string | null;
}
```

Replace the title validation block (lines 38-40):

```typescript
  if (input.title !== undefined && input.title !== null) {
    if (typeof input.title !== 'string' || input.title.length > 256) {
      errors.push('title must be a string of at most 256 characters');
    }
  }
```

And in the `createWar(db, {...})` call at the bottom of `createWarForVoter`, change the `title` line:

```typescript
    title: input.title ?? null,
```

- [ ] **Step 8: Pass an optional title through the route**

In `war-api/src/wars/routes.ts`, change the POST `/wars` handler's `title` line (currently `title: body.title as string,`):

```typescript
        title: body.title as string | null | undefined,
```

- [ ] **Step 9: Widen the response schema and view type**

In `war-api/src/wars/warPresenter.ts`, change `WarSummaryView.title`:

```typescript
  title: string | null;
```

And `warSummaryProperties.title`:

```typescript
  title: { type: ['string', 'null'] },
```

- [ ] **Step 10: Run the feature again to verify it passes**

Run: `npm --prefix war-api test -- -t "A title is optional"`
Expected: PASS

- [ ] **Step 11: Run the full war-api suite to check for regressions**

Run: `npm --prefix war-api test`
Expected: PASS. Check cyclomatic complexity of `createWarForVoter` post-edit; report to the user if it now exceeds 5 (it was already close before this change).

- [ ] **Step 12: Commit**

```bash
git add war-api/db/migrations/20260107000000_war_title_optional.sql war-api/src/db/types.ts war-api/src/wars/warsRepository.ts war-api/src/wars/warsService.ts war-api/src/wars/warPresenter.ts war-api/src/wars/routes.ts war-api/specs/features/war-creation.feature war-api/test/features/war-creation.steps.ts
git commit -m "feat(war-api): make a War's title optional at creation"
```

---

### Task 2: War theme becomes editable via PATCH

**Files:**
- Modify: `war-api/src/wars/warsRepository.ts` (`WarPatch` interface, `updateWar`)
- Modify: `war-api/src/wars/warsService.ts` (`PatchWarInput`, `patchWar`)
- Modify: `war-api/src/wars/routes.ts:124-158` (PATCH `/wars/:id` body schema and handler)
- Modify: `war-api/specs/features/war-lifecycle.feature`
- Modify: `war-api/test/features/war-lifecycle.steps.ts`

**Interfaces:**
- Consumes: `isWarTheme` from `war-api/src/wars/theme.ts` (already exists, already imported into `warsService.ts`).
- Produces: `PatchWarInput.theme?: string`. Task 3 (regen) picks this up automatically once it's in the route's body schema — `PatchWarPayload` in the UI is generated from that schema, never hand-typed.

- [ ] **Step 1: Add the feature scenario**

Add to `war-api/specs/features/war-lifecycle.feature`, after "Cannot edit after activation":

```gherkin
  Scenario: A creator changes a War's theme while it's still a draft
    Given a War in "draft" status
    When the creator PATCHes the theme to "fight_card"
    Then the response status is 200
    And the War's theme is "fight_card"
```

- [ ] **Step 2: Add the step definitions**

In `war-api/test/features/war-lifecycle.steps.ts`, add a new `Scenario` block (after `'Cannot edit after activation'`, before `'Non-creator cannot activate'`):

```typescript
  Scenario("A creator changes a War's theme while it's still a draft", ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a War in "draft" status', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creatorId);
      warId = war.id;
    });

    When('the creator PATCHes the theme to "fight_card"', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .patch(`/api/v1/wars/${warId}`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ theme: 'fight_card' });
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('the War\'s theme is "fight_card"', () => {
      expect(response.body.theme).toBe('fight_card');
    });
  });
```

- [ ] **Step 3: Run the feature to verify it fails**

Run: `npm --prefix war-api test -- -t "A creator changes a War's theme"`
Expected: FAIL — `theme` isn't in the PATCH route's body schema, so Fastify's ajv validation strips it silently and the War's theme is unchanged (still `arcade`), so the assertion on `response.body.theme` fails.

- [ ] **Step 4: Add `theme` to `WarPatch` and `updateWar`**

In `war-api/src/wars/warsRepository.ts`, add a field to `WarPatch`:

```typescript
export interface WarPatch {
  title?: string;
  category?: string | null;
  visibility?: string;
  mediaMode?: string;
  theme?: string;
  contestantSchema?: ContestantSchemaField[];
  endsAt?: Date | null;
}
```

And in `updateWar`, add the corresponding assignment alongside the existing ones:

```typescript
  if (patch.theme !== undefined) values.theme = patch.theme;
```

- [ ] **Step 5: Validate `theme` in `patchWar`**

In `war-api/src/wars/warsService.ts`, add a field to `PatchWarInput`:

```typescript
export interface PatchWarInput {
  title?: string;
  category?: string | null;
  visibility?: string;
  theme?: string;
  contestantSchema?: unknown;
  endsAt?: string | null;
}
```

And in `patchWar`, add a validation block alongside the existing `visibility` one (`isWarTheme` is already imported at the top of this file):

```typescript
  if (input.theme !== undefined) {
    if (!isWarTheme(input.theme)) {
      errors.push('theme must be "arcade", "fight_card", or "scrapbook"');
    } else {
      patch.theme = input.theme;
    }
  }
```

- [ ] **Step 6: Add `theme` to the PATCH route's body schema and handler**

In `war-api/src/wars/routes.ts`, add `theme` to the PATCH `/wars/:id` body schema's `properties` (alongside `title`, `category`, etc.):

```typescript
          theme: warSummaryProperties.theme,
```

And add the corresponding line to the `patchWar(...)` call's input object:

```typescript
          theme: body.theme as string | undefined,
```

- [ ] **Step 7: Run the feature again to verify it passes**

Run: `npm --prefix war-api test -- -t "A creator changes a War's theme"`
Expected: PASS

- [ ] **Step 8: Run the full war-api suite to check for regressions**

Run: `npm --prefix war-api test`
Expected: PASS. Check `patchWar`'s cyclomatic complexity post-edit; report to the user if it now exceeds 5.

- [ ] **Step 9: Commit**

```bash
git add war-api/src/wars/warsRepository.ts war-api/src/wars/warsService.ts war-api/src/wars/routes.ts war-api/specs/features/war-lifecycle.feature war-api/test/features/war-lifecycle.steps.ts
git commit -m "feat(war-api): allow a draft War's theme to be edited via PATCH"
```

---

### Task 3: Regenerate the API client

**Files:**
- Regenerate: `war-ui-default/openapi.json`, `war-ui-default/src/api/generated/schema.d.ts`
- Modify: `war-ui-default/src/api/client.ts:32-38` (`CreateWarPayload.title`)

**Interfaces:**
- Consumes: `war-api`'s live OpenAPI document (Tasks 1 and 2 must be committed first — this task dumps whatever `war-api` currently serves).
- Produces: `WarSummary.title: string | null` (used by Task 4), `PatchWarPayload` including `theme` (used by Task 5), `CreateWarPayload.title?: string` (used by Task 4).

- [ ] **Step 1: Regenerate**

Run: `npm --prefix war-ui-default run generate:api`

This rebuilds `war-api`, dumps its OpenAPI document to `war-ui-default/openapi.json`, and regenerates `src/api/generated/schema.d.ts` from it. Expect a diff in both files reflecting `WarSummary.title` becoming nullable and the PATCH `/wars/{id}` request body gaining `theme`.

- [ ] **Step 2: Make `CreateWarPayload.title` optional**

In `war-ui-default/src/api/client.ts`, change line 33:

```typescript
export interface CreateWarPayload {
  title?: string
  category?: string | null
  visibility?: 'public' | 'invite_only'
  theme?: 'arcade' | 'fight_card' | 'scrapbook'
  ends_at?: string | null
}
```

- [ ] **Step 3: Verify nothing broke**

Run: `npm --prefix war-ui-default run typecheck`
Expected: PASS — no other code reads `WarSummary.title` as a non-nullable string yet (Task 4 introduces the first place that will).

Run: `npm --prefix war-ui-default test`
Expected: PASS (129 unit tests, unaffected).

Run: `npm --prefix war-ui-default run test:acceptance`
Expected: PASS — no behavior has changed yet, only types and an unused-so-far optional field.

- [ ] **Step 4: Commit**

```bash
git add war-ui-default/openapi.json war-ui-default/src/api/generated/schema.d.ts war-ui-default/src/api/client.ts
git commit -m "chore(war-ui-default): regenerate API client for optional title and PATCH theme"
```

---

### Task 4: Replace the Create War wizard with an instant-create flow

**Files:**
- Modify: `war-ui-default/src/pages/CreateWar.tsx` (full rewrite)
- Delete: `war-ui-default/src/createWar/useCreateWarWizard.ts`
- Delete: `war-ui-default/src/createWar/MetadataStep.tsx`
- Delete: `war-ui-default/src/createWar/ContestantsStep.tsx`
- Delete: `war-ui-default/src/createWar/ReviewStep.tsx`
- Modify: `war-ui-default/features/create-war.feature` (full rewrite)
- Modify: `war-ui-default/tests/acceptance/create-war.spec.ts` (full rewrite)
- Modify: `war-ui-default/tests/acceptance/navigation.spec.ts:103-160`
- Modify: `war-ui-default/tests/acceptance/theme-switching.spec.ts:138-154`
- Modify: `war-ui-default/src/pages/EditWar.tsx:58` (title fallback)

**Interfaces:**
- Consumes: `createWar` and `CreateWarPayload` from `../api/client` (Task 3); `WarSummary` type.
- Produces: `CreateWar` component with no props, mounted at `/wars/new` (unchanged route in `App.tsx` — no router change needed).

- [ ] **Step 1: Rewrite the feature file**

Replace all of `war-ui-default/features/create-war.feature`:

```gherkin
Feature: Create War

  Scenario: Creating a War immediately creates an empty draft and forwards to its Edit page
    Given an authenticated voter
    When they choose to create a War
    Then an empty draft War is created via the API
    And they are redirected to that War's Edit page

  Scenario: Creating a War requires authentication
    Given no voter is authenticated
    When they navigate directly to "/wars/new"
    Then they are redirected to "/login"
    And the returnTo query param is "/wars/new"
```

- [ ] **Step 2: Rewrite the acceptance test file**

Replace all of `war-ui-default/tests/acceptance/create-war.spec.ts`:

```typescript
// Binds features/create-war.feature.
import { expect, test } from '@playwright/test'
import { buildWarDetail, buildWarSummary } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

const WAR_ID = 'war-create-1'

test('Creating a War immediately creates an empty draft and forwards to its Edit page', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: WAR_ID, title: null, status: 'draft' })
  const detail = buildWarDetail({ id: WAR_ID, title: null, status: 'draft', contestants: [] })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/wars/new')

  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
  await expect(page.getByTestId('edit-war-title-input')).toBeVisible()
  const calls = await getCallLog(page)
  const createCall = calls.find((call) => call.method === 'POST' && call.url.endsWith('/wars'))
  expect(createCall).toBeDefined()
  expect(JSON.parse(createCall!.body || '{}')).toEqual({})
})

test('A failed creation shows an error with a retry control', async ({ page }) => {
  // Arrange — the first POST fails, the retried one succeeds
  const createdWar = buildWarSummary({ id: WAR_ID, title: null, status: 'draft' })
  const detail = buildWarDetail({ id: WAR_ID, title: null, status: 'draft', contestants: [] })
  await useScenario(page, [
    {
      method: 'POST',
      path: `${API}/wars`,
      responses: [{ status: 500, body: { error: 'server error' } }, { status: 201, body: createdWar }],
    },
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/new')
  await expect(page.getByTestId('create-war-error')).toBeVisible()

  // Act
  await page.getByTestId('create-war-retry').click()

  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
})

test('Creating a War requires authentication', async ({ page }) => {
  // Act
  await page.goto('/wars/new')

  // Assert
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwars%2Fnew$/)
})
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npm --prefix war-ui-default run test:acceptance -- create-war.spec.ts`
Expected: the first two tests FAIL (the current wizard's Metadata step renders instead of an instant redirect — `edit-war-title-input` never appears, `create-war-error`/`create-war-retry` don't exist). The auth test still passes (unaffected).

- [ ] **Step 4: Delete the wizard's state machine and step components**

```bash
rm war-ui-default/src/createWar/useCreateWarWizard.ts war-ui-default/src/createWar/MetadataStep.tsx war-ui-default/src/createWar/ContestantsStep.tsx war-ui-default/src/createWar/ReviewStep.tsx
```

- [ ] **Step 5: Rewrite `CreateWar.tsx`**

Replace all of `war-ui-default/src/pages/CreateWar.tsx`:

```typescript
// Immediately creates an empty draft War and forwards to its Edit page —
// there is no creation wizard (the spec, "Create War"): every field a
// draft needs, including Activate, lives on the one Edit page.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createWar } from '../api/client'
import { toUserMessage } from '../api/errors'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function CreateWar() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)

  useEffect(() => {
    let cancelled = false
    setError(null)
    createWar({})
      .then((war) => {
        if (!cancelled) navigate(`/wars/${war.id}/edit`, { replace: true })
      })
      .catch((requestError) => {
        if (!cancelled) setError(toUserMessage(requestError))
      })
    return () => {
      cancelled = true
    }
  }, [attempt, navigate])

  return (
    <main data-theme={theme}>
      {error ? (
        <>
          <p role="alert" data-testid="create-war-error">
            {error}
          </p>
          <button type="button" data-testid="create-war-retry" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </>
      ) : (
        <p>Creating your War…</p>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Run the new tests again to verify they pass**

Run: `npm --prefix war-ui-default run test:acceptance -- create-war.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Fix `EditWar.tsx`'s title fallback**

An untitled draft's `<h1>` would otherwise render as bare "Edit " with nothing after it. In `war-ui-default/src/pages/EditWar.tsx`, change line 58:

```typescript
      <h1>Edit {war.title || 'War'}</h1>
```

- [ ] **Step 8: Fix the navigation reachability test**

In `war-ui-default/tests/acceptance/navigation.spec.ts`, the `REACHABILITY_ROWS` table's Create War row now points at a page that redirects away before the identity menu can be meaningfully checked from it. Replace it with a draft's Edit War page — genuinely new authenticated-only coverage, not redundant with any other row.

Add a draft War constant near `CREATED_WAR` (around line 103):

```typescript
const DRAFT_WAR = buildWarDetail({ id: 'war-nav-draft', title: 'Draft Nav War', status: 'draft', contestants: [] })
```

Change the `REACHABILITY_ROWS` table's Create War row:

```typescript
  { page: "a draft War's Edit page", path: `/wars/${DRAFT_WAR.id}/edit` },
```

Add a matching GET mock inside the `useScenario` call in the loop body (alongside the existing `GET /wars` and rankings mocks):

```typescript
      { method: 'GET', path: `${API}/wars/${DRAFT_WAR.id}`, responses: [{ status: 200, body: DRAFT_WAR }] },
```

- [ ] **Step 9: Fix the identity-menu click-through test**

In `war-ui-default/tests/acceptance/navigation.spec.ts`, the `'Selecting an item in the identity menu navigates there and closes the menu'` test (around line 145) clicks Create War and asserted the old wizard's heading. Replace its body:

```typescript
test('Selecting an item in the identity menu navigates there and closes the menu', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: 'war-nav-menu-created', title: null, status: 'draft' })
  const detail = buildWarDetail({ id: 'war-nav-menu-created', title: null, status: 'draft', contestants: [] })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    { method: 'GET', path: `${API}/wars/war-nav-menu-created`, responses: [{ status: 200, body: detail }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/')
  await openIdentityMenu(page)

  // Act
  await identityMenu(page).getByRole('menuitem', { name: 'Create War' }).click()

  // Assert
  await page.waitForURL('**/wars/war-nav-menu-created/edit')
  await expect(page.getByTestId('edit-war-title-input')).toBeVisible()
  await expect(identityMenu(page)).toHaveCount(0)
  await expect(identityTrigger(page)).toHaveAttribute('aria-expanded', 'false')
})
```

(`buildWarSummary` and `buildWarDetail` need to be in this file's import list — add them to the existing `from '../../src/mocks/fixtures'` import if not already present.)

- [ ] **Step 10: Remove the now-redundant Create-War-page theme test**

In `war-ui-default/tests/acceptance/theme-switching.spec.ts`, delete the `'The Create War wizard renders in the "home" theme and can be changed from the nav'` test (lines 138-154) outright. The Create War page is transitional now (it redirects on mount) and can no longer be meaningfully theme-tested in isolation; the "unthemed pages default to arcade, switchable from the nav" behavior it checked is already covered by `'Home renders in "arcade" until the voter chooses otherwise'` in the same file — Home and Create War share the same `'home'` theme-cookie scope (`EditWar.tsx`/`CreateWar.tsx` both call `useTheme('home', 'arcade')`).

- [ ] **Step 11: Run the full acceptance suite**

Run: `npm --prefix war-ui-default run test:acceptance`
Expected: PASS — no failures in `navigation.spec.ts`, `theme-switching.spec.ts`, `create-war.spec.ts`, or elsewhere.

Run: `npm --prefix war-ui-default run lint` and `npm --prefix war-ui-default run typecheck`
Expected: PASS — no leftover imports of the deleted wizard files.

- [ ] **Step 12: Commit**

```bash
git add war-ui-default/src/pages/CreateWar.tsx war-ui-default/src/createWar war-ui-default/features/create-war.feature war-ui-default/tests/acceptance/create-war.spec.ts war-ui-default/tests/acceptance/navigation.spec.ts war-ui-default/tests/acceptance/theme-switching.spec.ts war-ui-default/src/pages/EditWar.tsx
git commit -m "feat(war-ui-default): replace the Create War wizard with an instant-create flow"
```

---

### Task 5: Theme field on Edit War's metadata form

**Files:**
- Modify: `war-ui-default/src/editWar/EditWarMetadataForm.tsx`
- Modify: `war-ui-default/tests/acceptance/edit-war.spec.ts`

**Interfaces:**
- Consumes: `THEMES`, `THEME_LABELS`, `Theme` from `../theme/themeCookie` (already exist, already used by the deleted `MetadataStep.tsx`); `PatchWarPayload` now includes `theme` (Task 3).
- Produces: nothing new consumed by a later task.

- [ ] **Step 1: Write the failing test**

Add to `war-ui-default/tests/acceptance/edit-war.spec.ts`, after `'Changing visibility to invite-only persists'`:

```typescript
test('Changing the theme persists it', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', theme: 'arcade' })
  const patched = buildWarSummary({ id: WAR_ID, status: 'draft', theme: 'fight_card' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: patched }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-theme-select').selectOption('fight_card')
  await page.getByTestId('edit-war-metadata-submit').click()
  await expect(page.getByTestId('edit-war-metadata-submit')).toBeEnabled()

  // Assert
  const calls = await getCallLog(page)
  const patchCall = calls.find((c) => c.method === 'PATCH' && c.url.endsWith(`/wars/${WAR_ID}`))
  expect(JSON.parse(patchCall!.body ?? '{}').theme).toBe('fight_card')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix war-ui-default run test:acceptance -- -g "Changing the theme persists it"`
Expected: FAIL — `edit-war-theme-select` doesn't exist.

- [ ] **Step 3: Add the theme field**

Replace all of `war-ui-default/src/editWar/EditWarMetadataForm.tsx`:

```typescript
// EditWar's War-metadata form. Rendering only -- state and the PATCH call
// live in useEditWar. Theme now lives here too (moved off the deleted
// creation wizard, the spec's "Create War"/"Editing a draft") — a draft's
// theme is editable the same way every other field here is, since there is
// no longer a one-time wizard step to set it at creation instead.
import { useState, type FormEvent } from 'react'
import type { PatchWarPayload, WarDetailResponse } from '../api/client'
import { THEME_LABELS, THEMES, type Theme } from '../theme/themeCookie'

interface EditWarMetadataFormProps {
  war: WarDetailResponse
  error: string | null
  saving: boolean
  onSave: (payload: PatchWarPayload) => void
}

export function EditWarMetadataForm({ war, error, saving, onSave }: EditWarMetadataFormProps) {
  const [title, setTitle] = useState(war.title ?? '')
  const [category, setCategory] = useState(war.category ?? '')
  const [visibility, setVisibility] = useState<'public' | 'invite_only'>(war.visibility)
  const [theme, setTheme] = useState<Theme>(war.theme as Theme)
  const [endsAt, setEndsAt] = useState(war.ends_at ? war.ends_at.slice(0, 10) : '')
  const [titleRequiredError, setTitleRequiredError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Checked before any request goes out (the spec, "client-side
    // validate mandatory fields") -- an empty title is never valid.
    if (title.trim().length === 0) {
      setTitleRequiredError('Title is required')
      return
    }
    setTitleRequiredError(null)
    onSave({
      title,
      category: category.length > 0 ? category : null,
      visibility,
      theme,
      ends_at: endsAt.length > 0 ? new Date(endsAt).toISOString() : null,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Title
        <input data-testid="edit-war-title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Category
        <input
          data-testid="edit-war-category-input"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </label>
      <label>
        Visibility
        <select
          data-testid="edit-war-visibility-select"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as 'public' | 'invite_only')}
        >
          <option value="public">Public</option>
          <option value="invite_only">Invite only</option>
        </select>
      </label>
      <label>
        Theme
        <select
          data-testid="edit-war-theme-select"
          value={theme}
          onChange={(event) => setTheme(event.target.value as Theme)}
        >
          {THEMES.map((option) => (
            <option key={option} value={option}>
              {THEME_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <label>
        End date
        <input
          type="date"
          data-testid="edit-war-ends-at-input"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
        />
      </label>
      {(titleRequiredError || error) && (
        <p role="alert" data-testid="edit-war-metadata-error">
          {titleRequiredError ?? error}
        </p>
      )}
      <button type="submit" data-testid="edit-war-metadata-submit" disabled={saving}>
        Save
      </button>
    </form>
  )
}
```

(This also fixes `title` defaulting to `war.title ?? ''` instead of `war.title` — needed now that title can be `null`, and required for TypeScript to accept `useState(war.title ?? '')` against a `string | null` prop.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix war-ui-default run test:acceptance -- -g "Changing the theme persists it"`
Expected: PASS

- [ ] **Step 5: Run the full edit-war suite and typecheck**

Run: `npm --prefix war-ui-default run test:acceptance -- edit-war.spec.ts`
Expected: PASS (no regressions in existing metadata/contestant tests)

Run: `npm --prefix war-ui-default run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add war-ui-default/src/editWar/EditWarMetadataForm.tsx war-ui-default/tests/acceptance/edit-war.spec.ts
git commit -m "feat(war-ui-default): make a draft War's theme editable from Edit War"
```

---

### Task 6: Activate on Edit War, gated on the API's own requirements

**Files:**
- Modify: `war-ui-default/src/editWar/useEditWar.ts`
- Modify: `war-ui-default/src/pages/EditWar.tsx`
- Modify: `war-ui-default/tests/acceptance/edit-war.spec.ts`

**Interfaces:**
- Consumes: `activateWar` from `../api/client` (already exists, already used by the deleted wizard); `ApiError` from `../api/errors`.
- Produces: `EditWarActions.activate: () => Promise<void>`; `EditWarLoadedState.activating: boolean`, `activateDetails: string[] | null`; `useEditWar`'s second parameter, `onActivated?: (war: WarSummary) => void`.

- [ ] **Step 1: Write the failing tests**

Add to `war-ui-default/tests/acceptance/edit-war.spec.ts`, after the new theme test:

```typescript
test('Activate is disabled with fewer than 2 contestants', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada' })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('activate-submit')).toBeDisabled()
  await expect(page.getByTestId('activate-requirements')).toContainText('at least 2 contestants')
})

test('Activate is disabled when a contestant has no image', async ({ page }) => {
  // Arrange
  const withImage = buildContestant({ id: 'c-1', name: 'Ada' })
  const noImage = buildContestant({ id: 'c-2', name: 'Grace', media: [] })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [withImage, noImage] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('activate-submit')).toBeDisabled()
  await expect(page.getByTestId('activate-requirements')).toContainText('an image for every contestant')
})

test("Activating with the requirements met navigates to the War's vote page", async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  const activated = buildWarSummary({ id: WAR_ID, status: 'active' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/activate`, responses: [{ status: 200, body: activated }] },
    // The post-activation redirect lands on VoteMode, which joins and
    // requests the first matchup on mount -- stub both so that page
    // renders cleanly rather than surfacing an unrelated error.
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 204 }] },
  ])
  await gotoEditPage(page)
  await expect(page.getByTestId('activate-submit')).toBeEnabled()

  // Act
  await page.getByTestId('activate-submit').click()

  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/vote`)
})

test("A failed activation shows the API's validation messages", async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/activate`,
      responses: [{ status: 422, body: { error: 'validation error', details: ['every contestant needs media'] } }],
    },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('activate-submit').click()

  // Assert
  await expect(page.getByTestId('activate-error')).toHaveText('every contestant needs media')
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix war-ui-default run test:acceptance -- -g "Activat"`
Expected: FAIL (4 tests) — no `activate-submit`/`activate-requirements`/`activate-error` testid exists yet.

- [ ] **Step 3: Add the `activate` action to `useEditWar`**

In `war-ui-default/src/editWar/useEditWar.ts`:

Add to the imports:

```typescript
import {
  activateWar,
  addContestant as addContestantApi,
  deleteContestant as deleteContestantApi,
  deleteContestantMedia,
  getWar,
  patchContestant,
  patchWar,
  reorderContestantMedia,
  uploadContestantImages,
  type ContestantDetail,
  type PatchContestantPayload,
  type PatchWarPayload,
  type WarDetailResponse,
  type WarSummary,
} from '../api/client'
import { ApiError, toUserMessage } from '../api/errors'
```

Add two fields to `EditWarLoadedState`:

```typescript
  // Set while an Activate request is in flight, and to the API's own
  // validation messages when one fails -- mirrors the deleted wizard's
  // Review step, the spec's one deliberate exception to generic 422 copy.
  activating: boolean
  activateDetails: string[] | null
```

Add `activate` to `EditWarActions`:

```typescript
  activate: () => Promise<void>
```

Add a module-level helper, alongside `withContestant`:

```typescript
/**
 * The Activate action's own error copy (the spec's deliberate exception to
 * its generic 422 copy): the API's `details` array verbatim when the
 * failure actually carries one, falling back to the generic message
 * otherwise.
 */
function detailsFromActivateError(error: unknown): string[] {
  if (error instanceof ApiError && error.reason === 'validation' && error.details) {
    return error.details
  }
  return [toUserMessage(error)]
}
```

Change the `useEditWar` signature to accept an activation callback:

```typescript
export function useEditWar(
  warId: string | undefined,
  onActivated?: (war: WarSummary) => void,
): { state: EditWarState } & EditWarActions {
```

Add `activating: false, activateDetails: null` to the `setState({ status: 'loaded', ... })` call inside `load()`.

Add the `activate` function, after `moveImageUp`:

```typescript
  async function activate(): Promise<void> {
    if (!warId || state.status !== 'loaded') return
    setLoaded((prev) => ({ ...prev, activating: true, activateDetails: null }))
    try {
      const activated = await activateWar(warId)
      onActivated?.(activated)
    } catch (error) {
      setLoaded((prev) => ({ ...prev, activating: false, activateDetails: detailsFromActivateError(error) }))
    }
  }
```

Add `activate` to the returned object:

```typescript
  return {
    state,
    saveMetadata,
    saveContestant,
    addContestant,
    removeContestant,
    addImages,
    removeImage,
    moveImageUp,
    activate,
  }
```

- [ ] **Step 4: Add the Activate button and gating to `EditWar.tsx`**

In `war-ui-default/src/pages/EditWar.tsx`, add imports:

```typescript
import { useNavigate, useParams } from 'react-router-dom'
import type { ContestantDetail, WarSummary } from '../api/client'
```

Change the top of the component to wire up navigation and pull the new state/action:

```typescript
export function EditWar() {
  const { id: warId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const onActivated = (activated: WarSummary) => navigate(`/wars/${activated.id}/vote`)
  const {
    state,
    saveMetadata,
    saveContestant,
    addContestant,
    removeContestant,
    addImages,
    removeImage,
    moveImageUp,
    activate,
  } = useEditWar(warId, onActivated)
```

Change the destructuring of the loaded state to include the two new fields:

```typescript
  const { war, metadataError, savingMetadata, addContestantError, contestantErrors, activating, activateDetails } = state
```

Add the gating computation right after that destructuring:

```typescript
  const missingForActivation: string[] = []
  if (war.contestants.length < 2) missingForActivation.push('at least 2 contestants')
  if (war.contestants.some((contestant) => contestant.media.length === 0)) {
    missingForActivation.push('an image for every contestant')
  }
  const canActivate = missingForActivation.length === 0
```

Add the Activate block right after `<Toast message={state.toast} />`:

```typescript
      <div className="edit-war-activate">
        {!canActivate && (
          <p data-testid="activate-requirements">To activate this War, add {missingForActivation.join(' and ')}.</p>
        )}
        {activateDetails && (
          <ul role="alert" data-testid="activate-error">
            {activateDetails.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          data-testid="activate-submit"
          disabled={!canActivate || activating}
          onClick={() => void activate()}
        >
          Activate War
        </button>
      </div>
```

- [ ] **Step 5: Run the tests again to verify they pass**

Run: `npm --prefix war-ui-default run test:acceptance -- -g "Activat"`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full edit-war suite, full acceptance suite, lint, and typecheck**

Run: `npm --prefix war-ui-default run test:acceptance -- edit-war.spec.ts`
Expected: PASS

Run: `npm --prefix war-ui-default run test:acceptance`
Expected: PASS (full suite, no regressions)

Run: `npm --prefix war-ui-default run lint` and `npm --prefix war-ui-default run typecheck`
Expected: PASS

Check `EditWar`'s cyclomatic complexity post-edit (the gating computation adds two conditionals); report to the user if it now exceeds 5.

- [ ] **Step 7: Commit**

```bash
git add war-ui-default/src/editWar/useEditWar.ts war-ui-default/src/pages/EditWar.tsx war-ui-default/tests/acceptance/edit-war.spec.ts
git commit -m "feat(war-ui-default): add Activate to Edit War, gated on the API's activation rule"
```

---

### Task 7: Update PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

**Interfaces:** None — documentation only, no code.

- [ ] **Step 1: Remove the now-shipped Not-built entry**

Remove the "**Activating a draft left behind mid-wizard.**" bullet from the war-ui-default "Not built" section — this plan closes that gap.

- [ ] **Step 2: Add a Built entry**

Add to the war-ui-default "Built" section:

```markdown
- **Single-page War creation.** The multi-step Create War wizard (Metadata → Contestants →
  Review/Activate) is gone. `POST /wars` no longer requires a title (a War is identified by its
  id; `wars.title` is now a nullable column) — clicking Create War creates an empty draft and
  forwards straight to `/wars/:id/edit`, which now also carries theme editing (previously
  creation-only, since there was no PATCH path for it — `PATCH /wars/:id` accepts `theme` now
  too) and an **Activate** button. Activate is client-side disabled with an inline reason until
  the War meets the API's own rule (≥2 contestants, each with media); a failure the client-side
  check didn't catch shows the API's validation messages verbatim, same as the old wizard's
  Review step did.
```

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md for single-page War creation"
```

---

## Self-Review Notes

- **Spec coverage:** Domain Model Title row → Task 1. §6.1 Creation/Activation → Tasks 1, 6. §10.1 Routes (Edit War row) → already in the spec, no code task needed (routing unchanged, `/wars/:id/edit` already exists). §10.4 Create War / My Wars / Editing a draft / Activate → Tasks 4, 5, 6.
- **Placeholder scan:** none found — every step has real code or an exact shell command.
- **Type consistency:** `useEditWar(warId, onActivated)` in Task 6 matches the call site added in `EditWar.tsx` in the same task. `PatchWarPayload.theme` (generated in Task 3) matches the `theme` field sent in Task 5's `onSave` payload and validated in Task 2's `patchWar`. `EditWarLoadedState.activating`/`activateDetails` (Task 6) match the destructuring added in `EditWar.tsx` in the same task.
