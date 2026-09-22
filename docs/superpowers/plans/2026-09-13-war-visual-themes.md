# War Visual Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every War a creator-chosen visual theme (Arcade Showdown / Fight Card / Tape & Prints) that renders on its own pages, with a voter able to override it for themselves on a per-device, per-War basis, and give Home/My Wars their own independent theme (default `arcade`) on the same per-device basis.

**Architecture:** `wars.theme` is a new server-side column (creator's default, set at creation only, surfaced on `WarSummary`/`WarDetail`/`Rankings`). The voter's own override never reaches the server — it lives entirely in one small JSON cookie in the browser, keyed by War id (plus a reserved `home` key for Home/My Wars), read fresh on every render. A themed page renders its content under `<main data-theme="...">`; three CSS files select on that attribute. Responsive layout (flex/grid breakpoints) is a separate, theme-agnostic CSS layer so "make it responsive" and "three themes to choose from" don't tangle.

**Tech Stack:** war-api: Fastify + Kysely + node-pg-migrate raw SQL, Vitest + Supertest + `@amiceli/vitest-cucumber`. war-ui-default: React + Vite, plain CSS (Tailwind v4 is imported but unused by this feature), Vitest + Testing Library for units, Playwright + MSW for acceptance.

**Spec:** `war-spec.md` §4 ("Visual Theme", War table), §6.1 (Wars — creation), §10.4 ("Theme switching"). Already written and committed to this repo as of this plan — read it alongside this plan; it states the *why* behind several steps below (e.g. why the override never reaches the server, why Home/My Wars default to `arcade`).

## Global Constraints

- FluentAssertions is not used in this repo (TypeScript-only) — not applicable.
- Every test method/spec in `war-api` uses Arrange/Act/Assert comments where the test body has meaningful phases; Playwright acceptance tests in `war-ui-default` follow the same Arrange/Act/Assert comment convention already used in this repo's existing acceptance specs.
- Present each new acceptance/unit test for approval before writing the production code that makes it pass (project CLAUDE.md, Red-Green-Refactor). This plan's steps already follow that order — when executing, still show the test to the human partner before moving to the "implementation" step.
- After changing any function, check its cyclomatic complexity; report to the user if it exceeds 5. (`createWarForVoter`'s validation block is the one function in this plan worth checking — it is already non-trivial before this change.)
- Apply SOLID: this plan keeps the cookie module, the hook, and the switcher component as three separate single-purpose units rather than one file, and keeps server-side theme validation in one place (`src/wars/theme.ts`) rather than repeating the enum.
- No FluentAssertions/C# concerns apply to this repository.
- All commands run from the repository root per this repo's CLAUDE.md — `npm --prefix war-api ...` / `npm --prefix war-ui-default ...`, never `cd`.

---

## File Structure

**war-api (new/modified):**
- `db/migrations/20260103000000_add_war_theme.sql` — new migration
- `src/wars/theme.ts` — new: the one place `THEMES`/`WarTheme` is defined
- `src/db/types.ts` — modified: `WarsTable.theme`
- `src/wars/warsRepository.ts` — modified: `War`, `CreateWarInput`, `toWar`, `createWar`
- `src/wars/warsService.ts` — modified: `CreateWarInput`, `createWarForVoter` validation
- `src/wars/warPresenter.ts` — modified: `WarSummaryView`, schema, `presentWarSummary`
- `src/wars/routes.ts` — modified: POST `/wars` handler passes `theme` through
- `src/rankings/rankingsService.ts` — modified: `RankingsView`, schema, `rankingsFor`
- `test/setup/fixtures.ts` — modified: `DraftWarOptions.theme`, `makeDraftWar`
- `test/unit/warPresenter.test.ts` — modified fixture
- `test/unit/responseSchemas.test.ts` — modified fixtures (WarSummary ×2, RankingsView)
- `specs/features/war-creation.feature` + `test/features/war-creation.steps.ts` — new scenarios
- `specs/features/rankings.feature` + `test/features/rankings.steps.ts` — new scenario

**war-ui-default (new/modified):**
- `src/api/generated/schema.d.ts` — regenerated (not hand-edited)
- `src/api/client.ts` — modified: `CreateWarPayload.theme`
- `src/mocks/fixtures.ts` — modified: `buildWarSummary`, `buildRankingsResponse` defaults
- `src/theme/themeCookie.ts` — new: pure cookie read/write, one responsibility
- `src/theme/themeCookie.test.ts` — new
- `src/theme/useTheme.ts` — new: the one React hook that reads/writes a theme for a scope
- `src/theme/useTheme.test.ts` — new
- `src/theme/ThemeSwitcher.tsx` — new: the one themed-page control, no logic of its own
- `src/theme/layout.css` — new: responsive, theme-agnostic structure
- `src/theme/themes.css` — new: the three themes' color/type/shape
- `index.html` — modified: Google Fonts link for the six theme typefaces
- `src/index.css` — modified: imports the two new CSS files
- `src/components/NavBar.tsx` — modified: `className="nav-bar"`
- `src/components/WarCard.tsx` — modified: `className="war-card"`
- `src/components/ContestantCard.tsx` — modified: `className="contestant-card"` (drops inline style)
- `src/components/MatchupView.tsx` — modified: `className="matchup-view"`, new VS divider
- `src/components/ProgressBar.tsx` — modified: drops inline styles for classNames
- `src/components/RankingsTable.tsx` — modified: `className="rankings-table"`
- `src/pages/Home.tsx` — modified: themed, `.war-grid`, `ThemeSwitcher`
- `src/pages/MyWars.tsx` — modified: themed, `.war-grid`, `ThemeSwitcher`
- `src/pages/WarDetail.tsx` — modified: themed, `ThemeSwitcher`
- `src/pages/VoteMode.tsx` — modified: themed (fetches the War once for its theme), `ThemeSwitcher`
- `src/pages/Rankings.tsx` — modified: themed (theme now on the rankings response), `ThemeSwitcher`
- `src/createWar/MetadataStep.tsx` — modified: theme picker field
- `features/create-war.feature` + `tests/acceptance/create-war.spec.ts` — new scenario
- `features/theme-switching.feature` (new file) + `tests/acceptance/theme-switching.spec.ts` (new file) — new scenarios

---

### Task 1: War theme field, end-to-end in war-api

**Files:**
- Create: `war-api/db/migrations/20260103000000_add_war_theme.sql`
- Create: `war-api/src/wars/theme.ts`
- Modify: `war-api/src/db/types.ts` (`WarsTable` interface, ~line 25-34)
- Modify: `war-api/src/wars/warsRepository.ts`
- Modify: `war-api/src/wars/warsService.ts`
- Modify: `war-api/src/wars/warPresenter.ts`
- Modify: `war-api/src/wars/routes.ts` (POST `/wars` handler, ~line 87-107)
- Modify: `war-api/test/setup/fixtures.ts` (`DraftWarOptions`, `makeDraftWar`)
- Modify: `war-api/test/unit/warPresenter.test.ts`
- Modify: `war-api/test/unit/responseSchemas.test.ts`
- Modify: `war-api/specs/features/war-creation.feature`
- Modify: `war-api/test/features/war-creation.steps.ts`

**Interfaces:**
- Produces: `THEMES: readonly ['arcade', 'fight_card', 'scrapbook']` and `type WarTheme = 'arcade' | 'fight_card' | 'scrapbook'` from `src/wars/theme.ts` — every later task (Task 2, and every war-ui-default task) treats these three string literals as the full set of valid themes.
- Produces: `War.theme: string`, `WarSummaryView.theme: string` (required, enum-constrained in its JSON Schema) — Task 2 reads `war.theme` off the same `War` type.

- [ ] **Step 1: Write the failing acceptance tests**

Add to `war-api/specs/features/war-creation.feature` (append after the existing `Scenario: An unauthenticated request cannot create a War`):

```gherkin
  Scenario: A War's theme defaults to "arcade"
    Given an authenticated voter
    When they POST a title to /api/v1/wars
    Then a new War is created in "draft" status
    And its theme defaults to "arcade"

  Scenario: A creator sets a War's theme at creation
    Given an authenticated voter
    When they POST a title and theme "fight_card" to /api/v1/wars
    Then a new War is created in "draft" status
    And its theme is "fight_card"

  Scenario: An invalid theme is rejected
    Given an authenticated voter
    When they POST a title and theme "neon" to /api/v1/wars
    Then the response status is 422
    And no War is created
```

Add to `war-api/test/features/war-creation.steps.ts`, inside the existing `describeFeature(feature, ({ Scenario, BeforeEachScenario }) => { ... })` block, after the `Scenario('An unauthenticated request cannot create a War', ...)` block:

```ts
  Scenario("A War's theme defaults to \"arcade\"", ({ Given, When, Then, And }) => {
    let creatorId: string;
    let response: request.Response;

    Given('an authenticated voter', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
    });

    When('they POST a title to /api/v1/wars', async () => {
      response = await authedPost(creatorId, '/api/v1/wars', { title: 'Miss Universe 2026' });
    });

    Then('a new War is created in "draft" status', () => {
      expect(response.status).toBe(201);
      expect(response.body.status).toBe('draft');
    });

    And('its theme defaults to "arcade"', () => {
      expect(response.body.theme).toBe('arcade');
    });
  });

  Scenario("A creator sets a War's theme at creation", ({ Given, When, Then, And }) => {
    let creatorId: string;
    let response: request.Response;

    Given('an authenticated voter', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
    });

    When('they POST a title and theme "fight_card" to /api/v1/wars', async () => {
      response = await authedPost(creatorId, '/api/v1/wars', { title: 'Miss Universe 2026', theme: 'fight_card' });
    });

    Then('a new War is created in "draft" status', () => {
      expect(response.status).toBe(201);
      expect(response.body.status).toBe('draft');
    });

    And('its theme is "fight_card"', () => {
      expect(response.body.theme).toBe('fight_card');
    });
  });

  Scenario('An invalid theme is rejected', ({ Given, When, Then, And }) => {
    let creatorId: string;
    let response: request.Response;

    Given('an authenticated voter', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
    });

    When('they POST a title and theme "neon" to /api/v1/wars', async () => {
      response = await authedPost(creatorId, '/api/v1/wars', { title: 'Miss Universe 2026', theme: 'neon' });
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('no War is created', async () => {
      const rows = await harness.db.selectFrom('wars').selectAll().where('creator_id', '=', creatorId).execute();
      expect(rows).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: Run the new scenarios to verify they fail**

Run: `npm --prefix war-api run migrate` then `npm --prefix war-api test -- -t "theme"`
Expected: FAIL — `response.body.theme` is `undefined` (no such field exists yet); the "invalid theme is rejected" scenario currently gets 201, not 422, since nothing validates a `theme` field yet.

- [ ] **Step 3: Migration**

Create `war-api/db/migrations/20260103000000_add_war_theme.sql`:

```sql
-- Up Migration

ALTER TABLE wars ADD COLUMN theme VARCHAR(16) NOT NULL DEFAULT 'arcade';

-- Down Migration

ALTER TABLE wars DROP COLUMN theme;
```

Run: `npm --prefix war-api run migrate`
Expected: migration applies cleanly against the test database.

- [ ] **Step 4: The shared theme constant**

Create `war-api/src/wars/theme.ts`:

```ts
/**
 * The full set of valid War themes (spec, "Visual Theme"). Defined once
 * here rather than repeated as a literal union in `warPresenter.ts`'s JSON
 * Schema, `warsService.ts`'s validation, and `rankingsService.ts`'s
 * schema -- three independent copies of this list silently diverging is
 * exactly the failure mode `wars/routes.ts`'s `wantsOwnWars` comment warns
 * about for a different enum.
 */
export const THEMES = ['arcade', 'fight_card', 'scrapbook'] as const;
export type WarTheme = (typeof THEMES)[number];

export function isWarTheme(value: unknown): value is WarTheme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
```

- [ ] **Step 5: Repository — `theme` on `War`, `CreateWarInput`, `toWar`, `createWar`**

In `war-api/src/db/types.ts`, add to `WarsTable`:

```ts
export interface WarsTable {
  id: string;
  creator_id: string | null;
  title: string;
  category: string | null;
  status: Generated<string>;
  visibility: Generated<string>;
  media_mode: Generated<string>;
  theme: Generated<string>;
  contestant_schema: Generated<unknown>;
  ends_at: Timestamp | null;
  // ...unchanged fields below this line
}
```

In `war-api/src/wars/warsRepository.ts`:

```ts
export interface War {
  id: string;
  creatorId: string | null;
  title: string;
  category: string | null;
  status: string;
  visibility: string;
  mediaMode: string;
  theme: string;
  contestantSchema: ContestantSchemaField[];
  endsAt: Date | null;
  createdAt: Date;
}

function toWar(row: Selectable<WarsTable>): War {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    mediaMode: row.media_mode,
    theme: row.theme,
    contestantSchema: (row.contestant_schema ?? []) as ContestantSchemaField[],
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export interface CreateWarInput {
  creatorId: string;
  title: string;
  category: string | null;
  visibility: string;
  mediaMode: string;
  theme: string;
  contestantSchema: ContestantSchemaField[];
  endsAt: Date | null;
}

export async function createWar(db: Kysely<Database>, input: CreateWarInput): Promise<War> {
  const row = await db
    .insertInto('wars')
    .values({
      id: newId(),
      creator_id: input.creatorId,
      title: input.title,
      category: input.category,
      status: 'draft',
      visibility: input.visibility,
      media_mode: input.mediaMode,
      theme: input.theme,
      contestant_schema: toJsonb(input.contestantSchema),
      ends_at: input.endsAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toWar(row);
}
```

(No change to `WarPatch`/`updateWar`/`PatchWarInput` — theme, like media mode, is set once at creation only; the spec names no "edit a War's theme as its creator" capability.)

- [ ] **Step 6: Service — validate and default `theme` at creation**

In `war-api/src/wars/warsService.ts`, add the import and extend `CreateWarInput`/`createWarForVoter`:

```ts
import { isWarTheme } from './theme.js';

export interface CreateWarInput {
  creatorId: string;
  title: string;
  category?: string | null;
  visibility?: string;
  mediaMode?: string;
  theme?: string;
  contestantSchema?: unknown;
  endsAt?: string | null;
}

export async function createWarForVoter(db: Kysely<Database>, input: CreateWarInput): Promise<CreateWarOutcome> {
  const errors: string[] = [];

  if (typeof input.title !== 'string' || input.title.length === 0 || input.title.length > 256) {
    errors.push('title must be a non-empty string of at most 256 characters');
  }

  const mediaMode = input.mediaMode ?? 'image';
  if (mediaMode !== 'image') {
    errors.push('media_mode must be "image" in this slice');
  }

  const visibility = input.visibility ?? 'public';
  if (visibility !== 'public' && visibility !== 'invite_only') {
    errors.push('visibility must be "public" or "invite_only"');
  }

  const theme = input.theme ?? 'arcade';
  if (!isWarTheme(theme)) {
    errors.push('theme must be "arcade", "fight_card", or "scrapbook"');
  }

  let contestantSchema: ContestantSchemaField[] = [];
  if (input.contestantSchema !== undefined) {
    const validated = validateSchemaDefinition(input.contestantSchema);
    if (!validated.ok) {
      errors.push(...validated.errors);
    } else {
      contestantSchema = validated.value;
    }
  }

  let endsAt: Date | null = null;
  if (input.endsAt) {
    const parsed = new Date(input.endsAt);
    if (Number.isNaN(parsed.getTime())) {
      errors.push('ends_at must be a valid date-time');
    } else {
      endsAt = parsed;
    }
  }

  if (errors.length > 0) {
    return { kind: 'validationError', errors };
  }

  const war = await createWar(db, {
    creatorId: input.creatorId,
    title: input.title,
    category: input.category ?? null,
    visibility,
    mediaMode,
    theme,
    contestantSchema,
    endsAt,
  });

  return { kind: 'created', war };
}
```

Cyclomatic complexity check (project CLAUDE.md): `createWarForVoter` was already at 6 branches before this change (title length/empty, media mode, visibility, contestant schema present, schema valid, ends_at present, ends_at valid, errors present — McCabe complexity around 8 by the strict `if`/`&&` count) and this step adds one more branch (`!isWarTheme(theme)`). **Report this to the user**: `createWarForVoter` exceeds a complexity of 5; flag it in the task's final report rather than silently refactoring mid-feature (a refactor here is a separate, reviewable change, not bundled into this one).

- [ ] **Step 7: Presenter — `theme` on `WarSummaryView`**

In `war-api/src/wars/warPresenter.ts`:

```ts
import { THEMES } from './theme.js';

export interface WarSummaryView {
  id: string;
  title: string;
  category: string | null;
  status: string;
  visibility: string;
  media_mode: string;
  theme: string;
  contestant_schema: unknown;
  ends_at: string | null;
  contestant_count: number;
}

const warSummaryProperties = {
  id: { type: 'string', format: 'uuid' },
  title: { type: 'string' },
  category: { type: ['string', 'null'] },
  status: { type: 'string', enum: ['draft', 'active', 'closed'] },
  visibility: { type: 'string', enum: ['public', 'invite_only'] },
  media_mode: { type: 'string', enum: ['image'] },
  theme: { type: 'string', enum: [...THEMES] },
  contestant_schema: {
    type: 'array',
    items: {
      type: 'object',
      required: ['key', 'label', 'type'],
      properties: {
        key: { type: 'string' },
        label: { type: 'string' },
        type: { type: 'string', enum: ['string', 'number', 'text', 'url', 'date'] },
      },
    },
  },
  ends_at: { type: ['string', 'null'], format: 'date-time' },
  contestant_count: { type: 'integer', minimum: 0 },
};

const warSummaryRequired = [
  'id',
  'title',
  'category',
  'status',
  'visibility',
  'media_mode',
  'theme',
  'contestant_schema',
  'ends_at',
  'contestant_count',
];

export function presentWarSummary(war: War, now: Date, contestantCount: number): WarSummaryView {
  return {
    id: war.id,
    title: war.title,
    category: war.category,
    status: effectiveStatus(war, now),
    visibility: war.visibility,
    media_mode: war.mediaMode,
    theme: war.theme,
    contestant_schema: war.contestantSchema,
    ends_at: war.endsAt ? war.endsAt.toISOString() : null,
    contestant_count: contestantCount,
  };
}
```

- [ ] **Step 8: Route — pass `theme` from the request body through**

In `war-api/src/wars/routes.ts`, inside the `app.post('/wars', ...)` handler:

```ts
      const outcome = await createWarForVoter(db, {
        creatorId: request.voterId!,
        title: body.title as string,
        category: (body.category as string | null | undefined) ?? null,
        visibility: body.visibility as string | undefined,
        mediaMode: body.media_mode as string | undefined,
        theme: body.theme as string | undefined,
        contestantSchema: body.contestant_schema,
        endsAt: body.ends_at as string | null | undefined,
      });
```

- [ ] **Step 9: Update existing fixtures and unit tests so they still compile and pass**

In `war-api/test/setup/fixtures.ts`:

```ts
export interface DraftWarOptions {
  title?: string;
  visibility?: string;
  theme?: string;
  contestantSchema?: ContestantSchemaField[];
  endsAt?: Date | null;
}

export async function makeDraftWar(db: Kysely<Database>, creatorId: string, options: DraftWarOptions = {}): Promise<War> {
  return createWar(db, {
    creatorId,
    title: options.title ?? 'Test War',
    category: null,
    visibility: options.visibility ?? 'public',
    mediaMode: 'image',
    theme: options.theme ?? 'arcade',
    contestantSchema: options.contestantSchema ?? [],
    endsAt: options.endsAt ?? null,
  });
}
```

In `war-api/test/unit/warPresenter.test.ts`, add `theme: 'arcade'` to `makeWar`'s defaults and to the expected object in the existing `toEqual` assertion:

```ts
function makeWar(overrides: Partial<War> = {}): War {
  return {
    id: 'a5b1e2c4-9999-4a11-8a11-000000000001',
    creatorId: 'creator-1',
    title: 'Test War',
    category: null,
    status: 'draft',
    visibility: 'public',
    mediaMode: 'image',
    theme: 'arcade',
    contestantSchema: [],
    endsAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
```

```ts
    expect(view).toEqual({
      id: 'a5b1e2c4-9999-4a11-8a11-000000000002',
      title: 'Best Pageant',
      category: 'pageant',
      status: 'active',
      visibility: 'invite_only',
      media_mode: 'image',
      theme: 'arcade',
      contestant_schema: [],
      ends_at: '2026-02-01T00:00:00.000Z',
      contestant_count: 2,
    });
```

In `war-api/test/unit/responseSchemas.test.ts`, add `theme: 'arcade'` to both `WarSummaryView` fixtures (the "every field" one and the "null category/ends_at" one):

```ts
    const fixture: WarSummaryView = {
      id: 'a5b1e2c4-2222-4a11-8a11-000000000001',
      title: 'Best Pageant',
      category: 'pageant',
      status: 'active',
      visibility: 'public',
      media_mode: 'image',
      theme: 'arcade',
      contestant_schema: [{ key: 'height', label: 'Height', type: 'number' }],
      ends_at: '2026-01-01T00:00:00.000Z',
      contestant_count: 4,
    };
```

```ts
    const fixture: WarSummaryView = {
      id: 'a5b1e2c4-2222-4a11-8a11-000000000002',
      title: 'Best Pageant',
      category: null,
      status: 'draft',
      visibility: 'invite_only',
      media_mode: 'image',
      theme: 'arcade',
      contestant_schema: [],
      ends_at: null,
      contestant_count: 0,
    };
```

- [ ] **Step 10: Run the full war-api suite and verify it passes**

Run: `npm --prefix war-api run typecheck && npm --prefix war-api test`
Expected: PASS — the three new scenarios, plus every existing test now compiling against the widened `War`/`WarSummaryView`/`CreateWarInput` shapes.

- [ ] **Step 11: Commit**

```bash
git add war-api/db/migrations/20260103000000_add_war_theme.sql war-api/src/wars/theme.ts war-api/src/db/types.ts war-api/src/wars/warsRepository.ts war-api/src/wars/warsService.ts war-api/src/wars/warPresenter.ts war-api/src/wars/routes.ts war-api/test/setup/fixtures.ts war-api/test/unit/warPresenter.test.ts war-api/test/unit/responseSchemas.test.ts war-api/specs/features/war-creation.feature war-api/test/features/war-creation.steps.ts
git commit -m "feat(war-api): add a creator-chosen theme to War creation"
```

---

### Task 2: Rankings carry the War's own theme

Rankings is a themed page (spec §10.4) but `useRankings`/`Rankings.tsx` never fetches `GET /wars/:id` — only `GET /wars/:id/rankings`. Rather than add a second request just for `theme`, denormalize it onto the rankings response, the same way `war_id` and `status` already are.

**Files:**
- Modify: `war-api/src/rankings/rankingsService.ts`
- Modify: `war-api/test/unit/responseSchemas.test.ts`
- Modify: `war-api/specs/features/rankings.feature`
- Modify: `war-api/test/features/rankings.steps.ts`

**Interfaces:**
- Consumes: `War.theme` (Task 1).
- Produces: `RankingsView.theme: string` — war-ui-default's Task 9 reads `rankings.theme` as the War's default for the Rankings page.

- [ ] **Step 1: Write the failing acceptance test**

Add to `war-api/specs/features/rankings.feature` (append at the end):

```gherkin
  Scenario: Rankings report the War's own theme
    Given a public War with theme "fight_card"
    When rankings are fetched
    Then the response reports theme "fight_card"
```

Add to `war-api/test/features/rankings.steps.ts`, inside the `describeFeature` block:

```ts
  Scenario("Rankings report the War's own theme", ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a public War with theme "fight_card"', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
        visibility: 'public',
        theme: 'fight_card',
      });
      const activated = await activateWarForTest(harness.db, war);
      warId = activated.id;
    });

    When('rankings are fetched', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).get(`/api/v1/wars/${warId}/rankings`);
    });

    Then('the response reports theme "fight_card"', () => {
      expect(response.body.theme).toBe('fight_card');
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix war-api test -- -t "theme"`
Expected: FAIL — `response.body.theme` is `undefined`.

- [ ] **Step 3: Add `theme` to `RankingsView`, its schema, and `rankingsFor`**

In `war-api/src/rankings/rankingsService.ts`:

```ts
export interface RankingsView {
  war_id: string;
  status: string;
  theme: string;
  updated_at: string;
  rankings: RankingEntry[];
}

export const rankingsResponseSchema = {
  type: 'object',
  required: ['war_id', 'status', 'theme', 'updated_at', 'rankings'],
  properties: {
    war_id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['draft', 'active', 'closed'] },
    theme: { type: 'string', enum: ['arcade', 'fight_card', 'scrapbook'] },
    updated_at: { type: 'string', format: 'date-time' },
    rankings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rank', 'contestant', 'wins', 'appearances'],
        properties: {
          rank: { type: ['integer', 'null'] },
          contestant: contestantViewSchema,
          wins: { type: 'integer' },
          appearances: { type: 'integer' },
        },
      },
    },
  },
};
```

```ts
  return {
    kind: 'ok',
    visibility: war.visibility,
    view: {
      war_id: war.id,
      status: effectiveStatus(war, now),
      theme: war.theme,
      updated_at: now.toISOString(),
      rankings,
    },
  };
```

(Not importing `THEMES` from `../wars/theme.js` here to avoid a cross-domain import cycle risk — `rankingsService.ts` already imports concrete values from `../wars/warsRepository.js`, so importing the enum from `../wars/theme.js` the same way is consistent; use `import { THEMES } from '../wars/theme.js';` and `theme: { type: 'string', enum: [...THEMES] }` instead of the literal array above, matching Task 1's pattern.)

- [ ] **Step 4: Update the existing `RankingsView` fixture in `responseSchemas.test.ts`**

```ts
    const fixture: RankingsView = {
      war_id: 'a5b1e2c4-6666-4a11-8a11-000000000001',
      status: 'active',
      theme: 'arcade',
      updated_at: '2026-04-28T12:00:00.000Z',
      rankings: [
        // ...unchanged
      ],
    };
```

- [ ] **Step 5: Run the full war-api suite and verify it passes**

Run: `npm --prefix war-api run typecheck && npm --prefix war-api test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add war-api/src/rankings/rankingsService.ts war-api/test/unit/responseSchemas.test.ts war-api/specs/features/rankings.feature war-api/test/features/rankings.steps.ts
git commit -m "feat(war-api): report a War's theme on its rankings response"
```

---

### Task 3: Regenerate UI types; extend `CreateWarPayload` and fixtures

**Files:**
- Modify (generated, not hand-edited): `war-ui-default/src/api/generated/schema.d.ts`
- Modify: `war-ui-default/src/api/client.ts`
- Modify: `war-ui-default/src/mocks/fixtures.ts`

**Interfaces:**
- Consumes: the war-api OpenAPI document produced by Tasks 1-2 (`theme` on `WarSummary`, `theme` on the rankings response).
- Produces: `CreateWarPayload.theme?: 'arcade' | 'fight_card' | 'scrapbook'`, and `WarSummary`/rankings response types that include `theme` — every later war-ui-default task relies on these compiling.

- [ ] **Step 1: Regenerate the generated schema**

Run: `npm --prefix war-ui-default run generate:api`
Expected: `src/api/generated/schema.d.ts` changes — `WarSummary` and the rankings response type both gain a `theme` field typed as the enum `'arcade' | 'fight_card' | 'scrapbook'`.

- [ ] **Step 2: Extend `CreateWarPayload`**

In `war-ui-default/src/api/client.ts`:

```ts
export interface CreateWarPayload {
  title: string
  category?: string | null
  visibility?: 'public' | 'invite_only'
  theme?: 'arcade' | 'fight_card' | 'scrapbook'
  ends_at?: string | null
}
```

- [ ] **Step 3: Update fixtures so they compile against the widened generated types**

In `war-ui-default/src/mocks/fixtures.ts`:

```ts
export function buildWarSummary(overrides: Partial<WarSummary> = {}): WarSummary {
  return {
    id: overrides.id ?? 'war-1',
    title: 'Miss Universe 2026',
    category: 'Pageant',
    status: 'active',
    visibility: 'public',
    media_mode: 'image',
    theme: 'arcade',
    contestant_schema: [],
    ends_at: null,
    contestant_count: 0,
    ...overrides,
  }
}
```

```ts
export function buildRankingsResponse(overrides: Partial<RankingsResponse> = {}): RankingsResponse {
  return {
    war_id: 'war-1',
    status: 'active',
    theme: 'arcade',
    updated_at: '2026-04-28T12:00:00.000Z',
    rankings: [
      buildRankingEntry({ rank: 1, contestant: { id: 'contestant-1', name: 'Contestant One' }, wins: 5, appearances: 6 }),
      buildRankingEntry({ rank: 2, contestant: { id: 'contestant-2', name: 'Contestant Two' }, wins: 3, appearances: 6 }),
    ],
    ...overrides,
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm --prefix war-ui-default run typecheck`
Expected: PASS — no call site was relying on the previous, narrower `WarSummary`/`RankingsResponse` shape in a way that breaks.

- [ ] **Step 5: Commit**

```bash
git add war-ui-default/src/api/generated/schema.d.ts war-ui-default/src/api/client.ts war-ui-default/src/mocks/fixtures.ts
git commit -m "chore(war-ui-default): regenerate API types for War theme"
```

---

### Task 4: Theme cookie module (pure) + unit tests

**Files:**
- Create: `war-ui-default/src/theme/themeCookie.ts`
- Test: `war-ui-default/src/theme/themeCookie.test.ts`

**Interfaces:**
- Produces: `THEMES`, `type Theme`, `getThemePreference(key: string): Theme | null`, `setThemePreference(key: string, theme: Theme): void` — every remaining war-ui-default task imports these.

- [ ] **Step 1: Write the failing tests**

Create `war-ui-default/src/theme/themeCookie.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { getThemePreference, setThemePreference } from './themeCookie'

function clearStoredPreferences(): void {
  document.cookie = 'war_theme_prefs=; path=/; max-age=0'
}

describe('themeCookie', () => {
  afterEach(() => {
    // Arrange for the next test — each test starts with no stored preference
    clearStoredPreferences()
  })

  it('returns null for a key with no stored preference', () => {
    // Arrange
    // (no cookie written)

    // Act
    const result = getThemePreference('war-1')

    // Assert
    expect(result).toBeNull()
  })

  it('returns the theme previously set for that key', () => {
    // Arrange
    setThemePreference('war-1', 'fight_card')

    // Act
    const result = getThemePreference('war-1')

    // Assert
    expect(result).toBe('fight_card')
  })

  it('keeps preferences for different keys independent', () => {
    // Arrange
    setThemePreference('war-1', 'fight_card')
    setThemePreference('home', 'scrapbook')

    // Act
    const warTheme = getThemePreference('war-1')
    const homeTheme = getThemePreference('home')

    // Assert
    expect(warTheme).toBe('fight_card')
    expect(homeTheme).toBe('scrapbook')
  })

  it('overwrites a previous preference for the same key', () => {
    // Arrange
    setThemePreference('war-1', 'fight_card')

    // Act
    setThemePreference('war-1', 'scrapbook')

    // Assert
    expect(getThemePreference('war-1')).toBe('scrapbook')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix war-ui-default test -- themeCookie`
Expected: FAIL with "Cannot find module './themeCookie'" (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `war-ui-default/src/theme/themeCookie.ts`:

```ts
// Where a voter's own theme override lives (the spec, "Theme switching"):
// one small JSON map in a plain (non-HttpOnly) cookie, keyed by War id plus
// a reserved 'home' key for Home/My Wars. Deliberately client-side only —
// the spec requires the override to never sync across devices and never
// change what any other voter sees, so nothing here ever reaches the API.
export const THEMES = ['arcade', 'fight_card', 'scrapbook'] as const
export type Theme = (typeof THEMES)[number]

const COOKIE_NAME = 'war_theme_prefs'

type ThemePrefs = Record<string, Theme>

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

function readPrefs(): ThemePrefs {
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`))
  if (!match) return {}
  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(COOKIE_NAME.length + 1)))
    if (typeof parsed !== 'object' || parsed === null) return {}
    const prefs: ThemePrefs = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isTheme(value)) prefs[key] = value
    }
    return prefs
  } catch {
    return {}
  }
}

function writePrefs(prefs: ThemePrefs): void {
  const oneYearInSeconds = 60 * 60 * 24 * 365
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(prefs))}; path=/; max-age=${oneYearInSeconds}; SameSite=Lax`
}

/** `key` is a War id, or `'home'` for Home/My Wars. `null` means the voter has never chosen for this key. */
export function getThemePreference(key: string): Theme | null {
  return readPrefs()[key] ?? null
}

export function setThemePreference(key: string, theme: Theme): void {
  writePrefs({ ...readPrefs(), [key]: theme })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix war-ui-default test -- themeCookie`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add war-ui-default/src/theme/themeCookie.ts war-ui-default/src/theme/themeCookie.test.ts
git commit -m "feat(war-ui-default): add client-side theme preference storage"
```

---

### Task 5: `useTheme` hook + unit tests

**Files:**
- Create: `war-ui-default/src/theme/useTheme.ts`
- Test: `war-ui-default/src/theme/useTheme.test.ts`

**Interfaces:**
- Consumes: `getThemePreference`, `setThemePreference`, `Theme` (Task 4).
- Produces: `useTheme(key: string, fallback: Theme): [Theme, (theme: Theme) => void]` — Task 9/10/11's page components call this directly.

- [ ] **Step 1: Write the failing tests**

Create `war-ui-default/src/theme/useTheme.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useTheme } from './useTheme'

function clearStoredPreferences(): void {
  document.cookie = 'war_theme_prefs=; path=/; max-age=0'
}

describe('useTheme', () => {
  afterEach(() => {
    clearStoredPreferences()
  })

  it('returns the fallback when the voter has no stored preference for this key', () => {
    // Arrange
    const { result } = renderHook(() => useTheme('war-1', 'arcade'))

    // Act
    const [theme] = result.current

    // Assert
    expect(theme).toBe('arcade')
  })

  it('returns whatever fallback it is given, not a hardcoded default', () => {
    // Arrange
    const { result } = renderHook(() => useTheme('war-1', 'fight_card'))

    // Act
    const [theme] = result.current

    // Assert
    expect(theme).toBe('fight_card')
  })

  it('switches to the chosen theme and keeps it across re-renders', () => {
    // Arrange
    const { result } = renderHook(() => useTheme('war-1', 'arcade'))

    // Act
    act(() => {
      const [, choose] = result.current
      choose('scrapbook')
    })

    // Assert
    expect(result.current[0]).toBe('scrapbook')
  })

  it('keeps one key\'s choice from leaking into another key', () => {
    // Arrange
    const warHook = renderHook(() => useTheme('war-1', 'arcade'))
    act(() => {
      warHook.result.current[1]('fight_card')
    })

    // Act
    const homeHook = renderHook(() => useTheme('home', 'arcade'))

    // Assert
    expect(homeHook.result.current[0]).toBe('arcade')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix war-ui-default test -- useTheme`
Expected: FAIL with "Cannot find module './useTheme'".

- [ ] **Step 3: Write the minimal implementation**

Create `war-ui-default/src/theme/useTheme.ts`:

```ts
import { useState } from 'react'
import { getThemePreference, setThemePreference, type Theme } from './themeCookie'

/**
 * Resolves to the voter's own override for `key` if they have ever chosen
 * one, else `fallback`. Reads the cookie fresh on every render rather than
 * caching it in state: `fallback` (a War's own theme) is often not known
 * until after this hook's first call (the War is still loading), and a
 * cached override would also survive React Router reusing the same page
 * component across two different Wars — the route param changes without a
 * remount, which a one-time useState initializer would miss entirely.
 */
export function useTheme(key: string, fallback: Theme): [Theme, (theme: Theme) => void] {
  const [, forceRender] = useState(0)
  const theme = getThemePreference(key) ?? fallback

  function choose(next: Theme): void {
    setThemePreference(key, next)
    forceRender((count) => count + 1)
  }

  return [theme, choose]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix war-ui-default test -- useTheme`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add war-ui-default/src/theme/useTheme.ts war-ui-default/src/theme/useTheme.test.ts
git commit -m "feat(war-ui-default): add useTheme hook"
```

---

### Task 6: `ThemeSwitcher` component

No unit test for this one — per this repo's CLAUDE.md, Vitest unit tests here are for `client.ts` logic and pure functions, not components; this component's behavior is exercised by the acceptance tests in Tasks 9-11.

**Files:**
- Create: `war-ui-default/src/theme/ThemeSwitcher.tsx`

**Interfaces:**
- Consumes: `THEMES`, `type Theme` (Task 4).
- Produces: `<ThemeSwitcher theme={theme} onChange={setTheme} />`, with `data-testid="theme-switcher"` and `data-testid="theme-option-<value>"` per option — Tasks 9-11's acceptance tests click these.

- [ ] **Step 1: Write the component**

Create `war-ui-default/src/theme/ThemeSwitcher.tsx`:

```tsx
// Lets a voter override the theme they see for one scope — a specific War,
// or 'home' for Home/My Wars (the spec, "Theme switching"). Has no
// persistence logic of its own; the page that renders this owns the
// useTheme() call and passes both props down.
import { THEMES, type Theme } from './themeCookie'

const LABELS: Record<Theme, string> = {
  arcade: 'Arcade Showdown',
  fight_card: 'Fight Card',
  scrapbook: 'Tape & Prints',
}

interface ThemeSwitcherProps {
  theme: Theme
  onChange: (theme: Theme) => void
}

export function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  return (
    <div data-testid="theme-switcher" role="radiogroup" aria-label="Theme">
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`theme-option-${option}`}
          aria-pressed={option === theme}
          onClick={() => onChange(option)}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix war-ui-default run typecheck`
Expected: PASS (nothing references this component yet, so this only confirms the file itself compiles).

- [ ] **Step 3: Commit**

```bash
git add war-ui-default/src/theme/ThemeSwitcher.tsx
git commit -m "feat(war-ui-default): add ThemeSwitcher component"
```

---

### Task 7: Responsive layout CSS (theme-agnostic)

This is the "make it responsive" half of the original ask, kept deliberately separate from theme color/type/shape (Task 8) — one file decides arrangement and breakpoints, the other decides look. Verified with one acceptance test asserting both contestant cards stay visible, without page-level horizontal scroll, at a phone-width viewport.

**Files:**
- Create: `war-ui-default/src/theme/layout.css`
- Modify: `war-ui-default/src/index.css`
- Modify: `war-ui-default/src/components/NavBar.tsx`
- Modify: `war-ui-default/src/components/WarCard.tsx`
- Modify: `war-ui-default/src/components/ContestantCard.tsx`
- Modify: `war-ui-default/src/components/MatchupView.tsx`
- Modify: `war-ui-default/src/components/ProgressBar.tsx`
- Modify: `war-ui-default/src/components/RankingsTable.tsx`
- Create: `war-ui-default/features/vote-mode-responsive.feature`
- Create: `war-ui-default/tests/acceptance/vote-mode-responsive.spec.ts`

**Interfaces:**
- Produces: the classNames `nav-bar`, `war-grid`, `war-card`, `matchup-view`, `contestant-card`, `vs-divider`, `progress-track`, `progress-fill`, `rankings-table` — Task 8's theme CSS selects on every one of these.

- [ ] **Step 1: Write the failing acceptance test**

Create `war-ui-default/features/vote-mode-responsive.feature`:

```gherkin
Feature: Vote Mode Responsive Layout

  Scenario: Both contestant cards stay visible and the page does not scroll sideways on a phone
    Given an authenticated voter on a War's vote page, viewed at phone width
    When the first matchup has loaded
    Then both contestant cards are visible
    And the page has no horizontal scrollbar
```

Create `war-ui-default/tests/acceptance/vote-mode-responsive.spec.ts`:

```ts
// Binds features/vote-mode-responsive.feature.
import { expect, test } from '@playwright/test'
import { buildMatchupResponse } from '../../src/mocks/fixtures'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

test('Both contestant cards stay visible and the page does not scroll sideways on a phone', async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 390, height: 844 })
  const matchup = buildMatchupResponse()
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/war-1/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/war-1/matchups/next`, responses: [{ status: 200, body: matchup }] },
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: { id: 'war-1', title: 'Miss Universe 2026', category: null, status: 'active', visibility: 'public', media_mode: 'image', theme: 'arcade', contestant_schema: [], ends_at: null, contestant_count: 2, contestants: [] } }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/wars/war-1/vote')

  // Assert
  await expect(page.getByTestId('contestant-card').first()).toBeVisible()
  await expect(page.getByTestId('contestant-card').last()).toBeVisible()
  const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix war-ui-default run test:acceptance -- vote-mode-responsive`
Expected: FAIL — `contestant-card` currently has no responsive wrapping and `MatchupView`'s `display: flex` with two `flex: 1 1 0%` cards will typically still pass the "both visible" check but the test is written against the classNames this task introduces; more importantly it fails because the `GET /wars/war-1` mock path this task's VoteMode change will need doesn't exist in the component yet — confirm by running it now and observing the actual failure (likely a timeout waiting for `contestant-card`, since VoteMode does not yet call `getWar`). Treat whatever Playwright reports here as the baseline "red" to compare against after Step 8 below, not as a prediction to match exactly.

- [ ] **Step 3: Layout CSS**

Create `war-ui-default/src/theme/layout.css`:

```css
/* Structural, theme-agnostic responsive layout. Color/type/shape per
   theme lives in themes.css — this file only decides arrangement and
   breakpoints, so "responsive" and "which of the three themes" never
   tangle with each other. */

.nav-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
}

.war-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  list-style: none;
  padding: 0;
  margin: 1rem 0;
}
@media (max-width: 760px) {
  .war-grid {
    grid-template-columns: 1fr;
  }
}

.war-card {
  display: block;
  padding: 1rem;
}

.matchup-view {
  display: flex;
  align-items: center;
  gap: 0;
}
@media (max-width: 640px) {
  .matchup-view {
    flex-direction: column;
  }
}

.contestant-card {
  flex: 1 1 0%;
  min-width: 0;
  padding: 1rem;
}

.vs-divider {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.5rem;
  height: 4.5rem;
}
@media (max-width: 640px) {
  .vs-divider {
    margin-block: -0.5rem;
    position: relative;
    z-index: 1;
  }
}

.progress-track {
  width: 100%;
  height: 0.5rem;
}

.progress-fill {
  height: 100%;
}

.rankings-table {
  width: 100%;
  border-collapse: collapse;
}
@media (max-width: 640px) {
  .rankings-table {
    display: block;
    overflow-x: auto;
  }
}
```

- [ ] **Step 4: Import it**

In `war-ui-default/src/index.css`:

```css
@import 'tailwindcss';
@import './theme/layout.css';
@import './theme/themes.css';
```

(The `themes.css` import is added here now, even though Task 8 creates that file, so this task's own `npm run build`/dev server doesn't break on a missing import — create an empty `war-ui-default/src/theme/themes.css` with just this comment for now: `/* populated in Task 8 */`, and Task 8 replaces its contents.)

- [ ] **Step 5: Apply classNames — `NavBar`, `WarCard`**

In `war-ui-default/src/components/NavBar.tsx`, change the `<nav>` line:

```tsx
    <nav className="nav-bar" aria-label="Primary">
```

In `war-ui-default/src/components/WarCard.tsx`, change the `<Link>` line:

```tsx
    <Link to={`/wars/${war.id}`} data-testid="war-card" className="war-card">
```

- [ ] **Step 6: Apply classNames — `ContestantCard`, `MatchupView` (with the new VS divider)**

In `war-ui-default/src/components/ContestantCard.tsx`, replace the inline `style` with a className:

```tsx
    <div data-testid="contestant-card" aria-disabled={disabled} aria-busy={disabled} className="contestant-card">
```

In `war-ui-default/src/components/MatchupView.tsx`:

```tsx
import type { NextMatchupResponse } from '../api/client'
import { ContestantCard } from './ContestantCard'

interface MatchupViewProps {
  matchup: NextMatchupResponse['matchup']
  votingInFlight: boolean
  onSelect: (contestantId: string) => void
}

export function MatchupView({ matchup, votingInFlight, onSelect }: MatchupViewProps) {
  return (
    <div data-testid="matchup-view" className="matchup-view">
      <ContestantCard contestant={matchup.left} disabled={votingInFlight} onVote={onSelect} />
      <div className="vs-divider" data-testid="vs-divider" aria-hidden="true">
        VS
      </div>
      <ContestantCard contestant={matchup.right} disabled={votingInFlight} onVote={onSelect} />
    </div>
  )
}
```

(`aria-hidden` — the divider is decorative; the two contestants' names and the act of tapping a card already carry all the meaning a screen reader needs, same reasoning the spec gives for carousel dots being `aria-hidden`.)

- [ ] **Step 7: Apply classNames — `ProgressBar`, `RankingsTable`**

In `war-ui-default/src/components/ProgressBar.tsx`:

```tsx
export function ProgressBar({ voted, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((voted / total) * 100) : 0

  return (
    <div role="progressbar" aria-valuenow={voted} aria-valuemin={0} aria-valuemax={total}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p>
        {voted} of {total} matchups
      </p>
    </div>
  )
}
```

(`width` stays inline — it is a computed data value, not a style choice, the same distinction this codebase draws elsewhere between layout and content.)

In `war-ui-default/src/components/RankingsTable.tsx`, change the `<table>` line:

```tsx
    <table data-testid="rankings-table" className="rankings-table">
```

- [ ] **Step 8: Give `VoteMode` the `GET /wars/:id` fetch this task's test mocks**

This is a small look-ahead needed purely so Step 1's test has something real to assert on — Task 9 below replaces this with the full themed version. In `war-ui-default/src/pages/VoteMode.tsx`, add the import and the fetch, without yet wiring theme (that is Task 9):

```tsx
import { useParams } from 'react-router-dom'
import { getWar } from '../api/client'
import { MatchupView } from '../components/MatchupView'
import { ProgressBar } from '../components/ProgressBar'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { useVoteSession } from '../vote/useVoteSession'

export function VoteMode() {
  const { id: warId } = useParams<{ id: string }>()
  const { state, selectContestant } = useVoteSession(warId)
  useAsyncResource(warId ? () => getWar(warId) : undefined, [warId])

  if (state.phase === 'loading') return <p>Loading…</p>
  // ...unchanged below this line
```

- [ ] **Step 9: Run to verify the test passes**

Run: `npm --prefix war-ui-default run test:acceptance -- vote-mode-responsive`
Expected: PASS.

- [ ] **Step 10: Run the full unit suite too**

Run: `npm --prefix war-ui-default run typecheck && npm --prefix war-ui-default test`
Expected: PASS — no existing unit test asserted on the removed inline styles (confirmed in exploration: only `WarCard.test.ts` exists among these components, and it tests `timeRemainingLabel`/`contestantCountLabel`, not markup).

- [ ] **Step 11: Commit**

```bash
git add war-ui-default/src/theme/layout.css war-ui-default/src/theme/themes.css war-ui-default/src/index.css war-ui-default/src/components/NavBar.tsx war-ui-default/src/components/WarCard.tsx war-ui-default/src/components/ContestantCard.tsx war-ui-default/src/components/MatchupView.tsx war-ui-default/src/components/ProgressBar.tsx war-ui-default/src/components/RankingsTable.tsx war-ui-default/src/pages/VoteMode.tsx war-ui-default/features/vote-mode-responsive.feature war-ui-default/tests/acceptance/vote-mode-responsive.spec.ts
git commit -m "feat(war-ui-default): responsive layout for the voting interface and War cards"
```

---

### Task 8: The three theme stylesheets

Visual-only; verified by Tasks 9-11's acceptance tests checking `data-theme` switches what's rendered, not by a dedicated test here (there is no visual-regression tooling in this repo, and adding one is out of scope for this feature).

**Files:**
- Modify: `war-ui-default/src/theme/themes.css` (replacing the Task 7 placeholder)
- Modify: `war-ui-default/index.html`

**Interfaces:**
- Consumes: the classNames from Task 7, and the `data-theme` attribute values `arcade` / `fight_card` / `scrapbook` that Tasks 9-11 set on each themed page's `<main>`.

- [ ] **Step 1: Add the six Google Fonts**

In `war-ui-default/index.html`, inside `<head>`:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Share+Tech+Mono&family=Anton&family=Work+Sans:wght@400;600;700&family=Permanent+Marker&family=Quicksand:wght@400;600;700&display=swap"
    />
```

- [ ] **Step 2: Write the theme stylesheet**

Replace the contents of `war-ui-default/src/theme/themes.css`:

```css
/* Visual treatment per theme (the spec, "Visual Theme" / "Theme
   switching"): color, type, and a signature shape per theme, selected by
   the [data-theme] attribute each themed page sets on its <main>.
   Arrangement/breakpoints live in layout.css, not here. This is a first
   pass on each theme's identity — decorative flourishes from the approved
   mockup (CRT scanlines, washi tape, HUD corner brackets) are a later,
   separate visual-polish pass, not required for the theme to be
   recognizable and correctly switchable. */

[data-theme] {
  background: var(--t-bg);
  color: var(--t-text);
  padding: 1rem 1rem 2rem;
}

/* ---------- Arcade Showdown ---------- */
[data-theme='arcade'] {
  --t-bg: #0d0b1a;
  --t-surface: #1a1630;
  --t-text: #ede6d6;
  --t-accent1: #ff3e7f;
  --t-accent2: #35e8d4;
  --t-accent3: #f4e04d;
  --t-display-font: 'Press Start 2P', monospace;
  --t-body-font: 'Share Tech Mono', monospace;
  font-family: var(--t-body-font);
}
[data-theme='arcade'] h1,
[data-theme='arcade'] h2,
[data-theme='arcade'] h3 {
  font-family: var(--t-display-font);
}
[data-theme='arcade'] .war-card,
[data-theme='arcade'] .contestant-card {
  background: var(--t-surface);
  border: 2px solid var(--t-accent2);
}
[data-theme='arcade'] .vs-divider {
  background: linear-gradient(135deg, var(--t-accent1), var(--t-accent2));
  color: #0d0b1a;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  font-family: var(--t-display-font);
  font-size: 0.9rem;
}
[data-theme='arcade'] button {
  font-family: var(--t-body-font);
  background: var(--t-accent1);
  color: #0d0b1a;
  border: none;
  box-shadow: 3px 3px 0 var(--t-accent3);
}
[data-theme='arcade'] .progress-track {
  background: var(--t-surface);
  border: 2px solid var(--t-accent2);
}
[data-theme='arcade'] .progress-fill {
  background: var(--t-accent1);
}
[data-theme='arcade'] .rankings-table th {
  font-family: var(--t-display-font);
  color: var(--t-accent2);
  font-size: 0.7rem;
}

/* ---------- Fight Card ---------- */
[data-theme='fight_card'] {
  --t-bg: #141a26;
  --t-surface: #1d2433;
  --t-text: #efe9dd;
  --t-accent1: #e8442c;
  --t-accent2: #d8ae53;
  --t-accent3: #475168;
  --t-display-font: 'Anton', sans-serif;
  --t-body-font: 'Work Sans', sans-serif;
  font-family: var(--t-body-font);
}
[data-theme='fight_card'] h1,
[data-theme='fight_card'] h2,
[data-theme='fight_card'] h3 {
  font-family: var(--t-display-font);
  letter-spacing: 0.02em;
}
[data-theme='fight_card'] .war-card,
[data-theme='fight_card'] .contestant-card {
  background: var(--t-surface);
  border-left: 4px solid var(--t-accent2);
}
[data-theme='fight_card'] .vs-divider {
  background: var(--t-accent1);
  color: #fff;
  transform: rotate(-6deg);
  clip-path: polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%);
  font-family: var(--t-display-font);
  font-size: 1.4rem;
}
[data-theme='fight_card'] button {
  font-family: var(--t-body-font);
  font-weight: 600;
  background: var(--t-accent2);
  color: #141a26;
  border: none;
  clip-path: polygon(6% 0, 100% 0, 94% 100%, 0 100%);
}
[data-theme='fight_card'] .progress-fill {
  background: linear-gradient(90deg, var(--t-accent2), #efd28c);
}
[data-theme='fight_card'] .rankings-table th {
  font-family: var(--t-display-font);
  color: var(--t-accent2);
}

/* ---------- Tape & Prints ---------- */
[data-theme='scrapbook'] {
  --t-bg: #123b3a;
  --t-surface: #e8dcc3;
  --t-text: #f3ede0;
  --t-text-on-surface: #2b2118;
  --t-accent1: #ff6f59;
  --t-accent2: #ffc857;
  --t-accent3: #4e8d7c;
  --t-display-font: 'Permanent Marker', cursive;
  --t-body-font: 'Quicksand', sans-serif;
  font-family: var(--t-body-font);
}
[data-theme='scrapbook'] h1,
[data-theme='scrapbook'] h2,
[data-theme='scrapbook'] h3 {
  font-family: var(--t-display-font);
}
[data-theme='scrapbook'] .war-card,
[data-theme='scrapbook'] .contestant-card {
  background: var(--t-surface);
  color: var(--t-text-on-surface);
  border-radius: 3px;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.28);
}
[data-theme='scrapbook'] .vs-divider {
  background: #fff;
  color: var(--t-accent1);
  border-radius: 50%;
  transform: rotate(-8deg);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  font-family: var(--t-display-font);
  font-size: 1.2rem;
}
[data-theme='scrapbook'] button {
  font-family: var(--t-body-font);
  font-weight: 600;
  background: var(--t-accent1);
  color: #2b2118;
  border: none;
  border-radius: 20px;
}
[data-theme='scrapbook'] .progress-track {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 7px;
}
[data-theme='scrapbook'] .progress-fill {
  background: var(--t-accent1);
  border-radius: 7px;
}
[data-theme='scrapbook'] .rankings-table th {
  font-family: var(--t-display-font);
  color: var(--t-accent1);
}
```

- [ ] **Step 3: Run the dev server once and eyeball it**

Run: `npm --prefix war-ui-default run dev`, navigate to a page, and in the browser console run `document.querySelector('main')?.setAttribute('data-theme', 'fight_card')` (Task 9 will make this automatic — this is just confirming the CSS is wired before pages consume it). Expected: the page background, button, and any `.war-card`/`.contestant-card` visibly change.

- [ ] **Step 4: Commit**

```bash
git add war-ui-default/src/theme/themes.css war-ui-default/index.html
git commit -m "feat(war-ui-default): add the three theme stylesheets"
```

---

### Task 9: Theme WarDetail, VoteMode, and Rankings (per-War scope) + acceptance tests

**Files:**
- Modify: `war-ui-default/src/pages/WarDetail.tsx`
- Modify: `war-ui-default/src/pages/VoteMode.tsx`
- Modify: `war-ui-default/src/pages/Rankings.tsx`
- Create: `war-ui-default/features/theme-switching.feature`
- Create: `war-ui-default/tests/acceptance/theme-switching.spec.ts`

**Interfaces:**
- Consumes: `useTheme` (Task 5), `ThemeSwitcher` (Task 6), `war.theme` / `rankings.theme` (Tasks 1-3).

- [ ] **Step 1: Write the failing acceptance tests**

Create `war-ui-default/features/theme-switching.feature`:

```gherkin
Feature: Theme Switching

  Scenario: A War's detail page renders in its creator-chosen theme by default
    Given a War whose theme is "fight_card"
    When a voter views that War's detail page
    Then the page renders with theme "fight_card"

  Scenario: A voter's own theme choice overrides the War's default, only for that War
    Given a War whose theme is "fight_card"
    When a voter views that War's detail page and chooses the "Tape & Prints" theme
    And they reload the page
    Then the page renders with theme "scrapbook"

  Scenario: A voter's theme choice for one War does not affect a different War
    Given two Wars, one themed "fight_card" and one themed "arcade"
    When a voter chooses "Tape & Prints" on the first War's detail page
    And they view the second War's detail page
    Then the second War's page renders with theme "arcade"
```

Create `war-ui-default/tests/acceptance/theme-switching.spec.ts`:

```ts
// Binds features/theme-switching.feature.
import { expect, test } from '@playwright/test'
import { buildWarDetail } from '../../src/mocks/fixtures'
import { API, useScenario } from './support/mocking'

test('A War\'s detail page renders in its creator-chosen theme by default', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'fight_card')
})

test('A voter\'s own theme choice overrides the War\'s default, only for that War', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-1')
  await page.getByTestId('theme-option-scrapbook').click()
  await page.reload()

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'scrapbook')
})

test('A voter\'s theme choice for one War does not affect a different War', async ({ page }) => {
  // Arrange
  const warOne = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  const warTwo = buildWarDetail({ id: 'war-2', theme: 'arcade' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: warOne }] },
    { method: 'GET', path: `${API}/wars/war-2`, responses: [{ status: 200, body: warTwo }] },
  ])

  // Act
  await page.goto('/wars/war-1')
  await page.getByTestId('theme-option-scrapbook').click()
  await page.goto('/wars/war-2')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'arcade')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix war-ui-default run test:acceptance -- theme-switching`
Expected: FAIL — `WarDetail`'s `<main>` has no `data-theme` attribute at all yet, and there is no `theme-switcher`/`theme-option-*` on the page.

- [ ] **Step 3: Theme `WarDetail`**

In `war-ui-default/src/pages/WarDetail.tsx`:

```tsx
import { useParams } from 'react-router-dom'
import { getWar, type ContestantDetail } from '../api/client'
import { ContestantAttributes } from '../components/ContestantAttributes'
import { ContestantThumbnail } from '../components/ContestantThumbnail'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { useTheme } from '../theme/useTheme'

export function WarDetail() {
  const { id } = useParams<{ id: string }>()
  const state = useAsyncResource(id ? () => getWar(id) : undefined, [id])
  const [theme, setTheme] = useTheme(id ?? '', state.status === 'loaded' ? state.value.theme : 'arcade')

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>

  const war = state.value
  return (
    <main data-theme={theme}>
      <ThemeSwitcher theme={theme} onChange={setTheme} />
      <h1>{war.title}</h1>
      {war.category && <p>{war.category}</p>}
      <ul>
        {war.contestants.map((contestant) => (
          <li key={contestant.id}>
            <ContestantGalleryItem contestant={contestant} />
          </li>
        ))}
      </ul>
    </main>
  )
}

function ContestantGalleryItem({ contestant }: { contestant: ContestantDetail }) {
  return (
    <div data-testid="contestant-gallery-item">
      <ContestantThumbnail media={contestant.media} name={contestant.name} />
      <h2>{contestant.name}</h2>
      <ContestantAttributes attributes={contestant.attributes} />
    </div>
  )
}
```

- [ ] **Step 4: Theme `VoteMode`**

In `war-ui-default/src/pages/VoteMode.tsx` (building on Task 7's Step 8 addition):

```tsx
import { useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { getWar } from '../api/client'
import { MatchupView } from '../components/MatchupView'
import { ProgressBar } from '../components/ProgressBar'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { useTheme } from '../theme/useTheme'
import { useVoteSession } from '../vote/useVoteSession'

export function VoteMode() {
  const { id: warId } = useParams<{ id: string }>()
  const { state, selectContestant } = useVoteSession(warId)
  const warState = useAsyncResource(warId ? () => getWar(warId) : undefined, [warId])
  const [theme, setTheme] = useTheme(warId ?? '', warState.status === 'loaded' ? warState.value.theme : 'arcade')

  if (state.phase === 'loading') return <p>Loading…</p>
  if (state.phase === 'error') return <p role="alert">{state.message}</p>
  if (state.phase === 'completed') {
    return (
      <div data-testid="vote-complete">
        <h2>You&rsquo;ve voted on every matchup — thank you!</h2>
        <Link to={`/wars/${warId}/rankings`} data-testid="rankings-link">
          See the rankings
        </Link>
      </div>
    )
  }

  return (
    <main data-theme={theme}>
      <ThemeSwitcher theme={theme} onChange={setTheme} />
      <ProgressBar voted={state.progress.voted} total={state.progress.total} />
      {state.errorMessage && (
        <p role="status" data-testid="vote-error">
          {state.errorMessage}
        </p>
      )}
      <MatchupView matchup={state.matchup} votingInFlight={state.votingInFlight} onSelect={selectContestant} />
    </main>
  )
}
```

(The `'completed'` branch stays unthemed — it is a short-lived terminal screen with a single link, not one of the three pages the spec names as themed.)

- [ ] **Step 5: Theme `Rankings`**

In `war-ui-default/src/pages/Rankings.tsx`:

```tsx
import { useParams } from 'react-router-dom'
import { RankingsTable } from '../components/RankingsTable'
import { useRankings } from '../rankings/useRankings'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { useTheme } from '../theme/useTheme'

export function Rankings() {
  const { id: warId } = useParams<{ id: string }>()
  const state = useRankings(warId)
  const [theme, setTheme] = useTheme(
    warId ?? '',
    state.status === 'loaded' ? state.rankings.theme : 'arcade',
  )

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>

  return (
    <main data-theme={theme}>
      <ThemeSwitcher theme={theme} onChange={setTheme} />
      <h1>Rankings</h1>
      <RankingsTable rankings={state.rankings.rankings} />
    </main>
  )
}
```

(`state.rankings` is `useRankings`'s raw, unnarrowed `RankingsResponse` — confirmed in `war-ui-default/src/rankings/useRankings.ts`, which passes `getRankings(id)`'s result straight into state — so `state.rankings.theme` is available the same way `state.rankings.rankings` already is on the next line.)

- [ ] **Step 6: Run to verify the acceptance tests pass**

Run: `npm --prefix war-ui-default run test:acceptance -- theme-switching`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full suite**

Run: `npm --prefix war-ui-default run typecheck && npm --prefix war-ui-default test && npm --prefix war-ui-default run test:acceptance`
Expected: PASS across the board, including Task 7's `vote-mode-responsive` scenario (VoteMode's shape changed again in this task — rerun it specifically to be sure: `npm --prefix war-ui-default run test:acceptance -- vote-mode-responsive`).

- [ ] **Step 8: Commit**

```bash
git add war-ui-default/src/pages/WarDetail.tsx war-ui-default/src/pages/VoteMode.tsx war-ui-default/src/pages/Rankings.tsx war-ui-default/features/theme-switching.feature war-ui-default/tests/acceptance/theme-switching.spec.ts
git commit -m "feat(war-ui-default): theme WarDetail, VoteMode, and Rankings per War"
```

---

### Task 10: Theme Home and My Wars (home scope) + acceptance tests

**Files:**
- Modify: `war-ui-default/src/pages/Home.tsx`
- Modify: `war-ui-default/src/pages/MyWars.tsx`
- Modify: `war-ui-default/features/theme-switching.feature`
- Modify: `war-ui-default/tests/acceptance/theme-switching.spec.ts`

**Interfaces:**
- Consumes: `useTheme`, `ThemeSwitcher` (Tasks 5-6).

- [ ] **Step 1: Write the failing acceptance tests**

Append to `war-ui-default/features/theme-switching.feature`:

```gherkin
  Scenario: Home renders in "arcade" until the voter chooses otherwise
    Given no theme has been chosen for Home yet
    When a voter views Home
    Then the page renders with theme "arcade"

  Scenario: Choosing a theme on Home does not change what a War's own page shows
    Given a War whose theme is "fight_card"
    When a voter chooses the "Tape & Prints" theme on Home
    And they view that War's detail page
    Then the War's page still renders with theme "fight_card"
```

Append to `war-ui-default/tests/acceptance/theme-switching.spec.ts` (add the `buildWars`/`buildWarSummary` import alongside the existing `buildWarDetail` import):

```ts
test('Home renders in "arcade" until the voter chooses otherwise', async ({ page }) => {
  // Arrange
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [] } }] }])

  // Act
  await page.goto('/')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'arcade')
})

test('Choosing a theme on Home does not change what a War\'s own page shows', async ({ page }) => {
  // Arrange
  const warDetail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [] } }] },
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: warDetail }] },
  ])

  // Act
  await page.goto('/')
  await page.getByTestId('theme-option-scrapbook').click()
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'fight_card')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix war-ui-default run test:acceptance -- theme-switching`
Expected: FAIL on the two new scenarios — `Home`'s `<main>` has no `data-theme` attribute.

- [ ] **Step 3: Theme `Home`**

In `war-ui-default/src/pages/Home.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { getWars, type WarSummary } from '../api/client'
import { useAuth } from '../auth/context'
import { WarCard } from '../components/WarCard'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { useTheme } from '../theme/useTheme'

export function Home() {
  const { isAuthenticated } = useAuth()
  const state = useAsyncResource(() => getWars(), [])
  const [theme, setTheme] = useTheme('home', 'arcade')

  return (
    <main data-theme={theme}>
      <ThemeSwitcher theme={theme} onChange={setTheme} />
      <h1>War</h1>
      {!isAuthenticated && (
        <Link to="/login" data-testid="login-cta">
          Login to Vote
        </Link>
      )}
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'loaded' && <HomeWarList wars={state.value.wars} isAuthenticated={isAuthenticated} />}
    </main>
  )
}

function HomeWarList({ wars, isAuthenticated }: { wars: WarSummary[]; isAuthenticated: boolean }) {
  if (wars.length === 0) {
    return <HomeEmptyState isAuthenticated={isAuthenticated} />
  }
  return (
    <ul className="war-grid">
      {wars.map((war) => (
        <li key={war.id}>
          <WarCard war={war} />
        </li>
      ))}
    </ul>
  )
}

function HomeEmptyState({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (!isAuthenticated) {
    return <p data-testid="empty-state">No active Wars right now — check back soon.</p>
  }
  return (
    <div data-testid="empty-state">
      <p>No active Wars right now — create one to get started.</p>
      <Link to="/wars/new" data-testid="home-create-war-cta">
        Create a War
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: Theme `MyWars`**

In `war-ui-default/src/pages/MyWars.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { getWars, type WarSummary } from '../api/client'
import { WarCard } from '../components/WarCard'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { useTheme } from '../theme/useTheme'

export function MyWars() {
  const state = useAsyncResource(() => getWars({ creator: 'me' }), [])
  const [theme, setTheme] = useTheme('home', 'arcade')

  return (
    <main data-theme={theme}>
      <ThemeSwitcher theme={theme} onChange={setTheme} />
      <h1>My Wars</h1>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'loaded' && <MyWarsList wars={state.value.wars} />}
    </main>
  )
}

function MyWarsList({ wars }: { wars: WarSummary[] }) {
  if (wars.length === 0) {
    return (
      <div data-testid="empty-state">
        <p>You haven&rsquo;t created any Wars yet.</p>
        <Link to="/wars/new" data-testid="my-wars-create-war-cta">
          Create a War
        </Link>
      </div>
    )
  }
  return (
    <ul className="war-grid">
      {wars.map((war) => (
        <li key={war.id}>
          <WarCard war={war} />
        </li>
      ))}
    </ul>
  )
}
```

(My Wars and Home share the same `'home'` key deliberately — the spec's "Theme switching" passage treats them as one scope, "Home and My Wars... render in `arcade` until the voter picks a theme for those pages specifically," not two.)

- [ ] **Step 5: Run to verify it passes**

Run: `npm --prefix war-ui-default run test:acceptance -- theme-switching`
Expected: PASS (5 tests total in this file now).

- [ ] **Step 6: Run the full suite**

Run: `npm --prefix war-ui-default run typecheck && npm --prefix war-ui-default test && npm --prefix war-ui-default run test:acceptance`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add war-ui-default/src/pages/Home.tsx war-ui-default/src/pages/MyWars.tsx war-ui-default/features/theme-switching.feature war-ui-default/tests/acceptance/theme-switching.spec.ts
git commit -m "feat(war-ui-default): theme Home and My Wars, defaulting to arcade"
```

---

### Task 11: CreateWar wizard — theme picker at creation

**Files:**
- Modify: `war-ui-default/src/createWar/MetadataStep.tsx`
- Modify: `war-ui-default/features/create-war.feature`
- Modify: `war-ui-default/tests/acceptance/create-war.spec.ts`

**Interfaces:**
- Consumes: `CreateWarPayload.theme` (Task 3), `THEMES` (Task 4).

- [ ] **Step 1: Write the failing acceptance test**

Append to `war-ui-default/features/create-war.feature`:

```gherkin
  Scenario: A creator picks a theme in the Metadata step
    Given an authenticated voter on the Create War page
    When they submit the Metadata step with a title and choose the "Fight Card" theme
    Then the War is created with theme "fight_card"
```

Append to `war-ui-default/tests/acceptance/create-war.spec.ts`:

```ts
test('A creator picks a theme in the Metadata step', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: WAR_ID, title: 'Miss Universe 2026', theme: 'fight_card' })
  await useScenario(page, [{ method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] }])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/new')

  // Act
  await page.getByTestId('metadata-title-input').fill('Miss Universe 2026')
  await page.getByTestId('metadata-theme-select').selectOption('fight_card')
  await page.getByTestId('metadata-submit').click()
  await expect(page.getByTestId('contestant-name-input')).toBeVisible()

  // Assert
  const calls = await getCallLog(page)
  const createCall = calls.find((call) => call.method === 'POST' && call.url.endsWith('/wars'))
  expect(createCall).toBeDefined()
  expect(JSON.parse(createCall!.body ?? '{}').theme).toBe('fight_card')
})
```

(`contestant-name-input` is the Contestants step's own name field, confirmed in `war-ui-default/src/createWar/ContestantsStep.tsx` — its appearance is what proves the wizard advanced past Metadata, the same signal this file's first scenario relies on implicitly by moving straight to `addContestantWithImage`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix war-ui-default run test:acceptance -- create-war`
Expected: FAIL — no `metadata-theme-select` exists yet, and the POST body has no `theme` field.

- [ ] **Step 3: Add the theme field to `MetadataStepView`**

In `war-ui-default/src/createWar/MetadataStep.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import type { CreateWarPayload } from '../api/client'
import { THEMES, type Theme } from '../theme/themeCookie'
import type { WizardState } from './useCreateWarWizard'

type MetadataState = Extract<WizardState, { step: 'metadata' }>

const THEME_LABELS: Record<Theme, string> = {
  arcade: 'Arcade Showdown',
  fight_card: 'Fight Card',
  scrapbook: 'Tape & Prints',
}

export function MetadataStepView({ state, onSubmit }: { state: MetadataState; onSubmit: (payload: CreateWarPayload) => void }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'invite_only'>('public')
  const [theme, setTheme] = useState<Theme>('arcade')
  const [endsAt, setEndsAt] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit({
      title,
      category: category.length > 0 ? category : null,
      visibility,
      theme,
      ends_at: endsAt.length > 0 ? new Date(endsAt).toISOString() : null,
    })
  }

  return (
    <main>
      <h1>Create a War</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Title
          <input data-testid="metadata-title-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Category
          <input
            data-testid="metadata-category-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </label>
        <label>
          Visibility
          <select
            data-testid="metadata-visibility-select"
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
            data-testid="metadata-theme-select"
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
            data-testid="metadata-ends-at-input"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </label>
        {state.error && (
          <p role="alert" data-testid="metadata-error">
            {state.error}
          </p>
        )}
        <button type="submit" data-testid="metadata-submit" disabled={state.submitting}>
          Continue
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix war-ui-default run test:acceptance -- create-war`
Expected: PASS, including the pre-existing scenarios in this file (the new field defaults to `'arcade'` and is additive, so the original "voter completes the wizard" scenario's `POST /wars` call now also carries `theme: 'arcade'`, which its mock response doesn't need to echo back for that test to keep passing).

- [ ] **Step 5: Run the full suite**

Run: `npm --prefix war-ui-default run typecheck && npm --prefix war-ui-default test && npm --prefix war-ui-default run test:acceptance`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add war-ui-default/src/createWar/MetadataStep.tsx war-ui-default/features/create-war.feature war-ui-default/tests/acceptance/create-war.spec.ts
git commit -m "feat(war-ui-default): let a War's creator pick its theme at creation"
```

---

## Self-Review Notes

- **Spec coverage:** §4 "Visual Theme" → Task 1 (column, enum, default). §4 War table "Theme" row → Task 1. §6.1 "theme... optional, with documented defaults" → Task 1 Step 6, Task 11. §10.4 "Theme switching" (War pages show creator theme until overridden, per-device, per-War, never synced, never affects other voters; Home/My Wars default `arcade` until chosen) → Tasks 4, 5, 9, 10. Nothing in the spec's new text is left unimplemented by this plan.
- **Placeholder scan:** none found — every step has literal, runnable code or a literal command. The one deliberate placeholder-looking file (`themes.css` left as a one-line comment inside Task 7) is explicitly replaced by name in Task 8's Step 2, not left dangling.
- **Type consistency:** `Theme`/`THEMES` defined once in `war-ui-default/src/theme/themeCookie.ts` (Task 4) and imported everywhere else in war-ui-default that needs it (Tasks 6, 9, 10, 11) rather than redeclared. `WarTheme`/`THEMES` defined once in `war-api/src/wars/theme.ts` (Task 1) and imported by Task 2. `useTheme`'s signature (`(key: string, fallback: Theme) => [Theme, (theme: Theme) => void]`) is used identically in Tasks 9 and 10.
- **Scope check:** single feature, eleven right-sized tasks, no sub-project split needed. Explicitly out of scope (not in any task above): editing a War's theme after creation, decorative flourishes beyond each theme's core identity, visual-regression testing, and any server-side storage of the voter's override.
