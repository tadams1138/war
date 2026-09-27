# Abuse Reporting & Moderator/Admin Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any Voter report a War for abuse with a short explanation, and let Moderators/Admins (new account-level roles) review reports, see which Wars still have unaddressed ones, and mark reports addressed — while War creators and everyone else stay unable to see any report.

**Architecture:** Two new war-api modules, `roles` (account-level role storage + grant/revoke, Admin-only) and `reports` (abuse reports, filed by any Voter, reviewed by Moderator/Admin), following the existing `wars`/`contestants` module shape: a `*Repository.ts` (Kysely queries), a `*Service.ts` (validation + orchestration, `MutationOutcome`-shaped returns), and a `routes.ts` (Fastify route registration, reusing `bearerAuthRoute`/`replyForOutcome`). Roles are two boolean columns on `voters` (`is_moderator`, `is_admin`), not a separate grants table — a Voter either has a role or doesn't, no grant history is required by spec. Reports are an append-only table, never deleted except when their War is deleted.

**Tech Stack:** Node/TypeScript, Fastify 5, Kysely 0.29 + `pg`, `node-pg-migrate`, Vitest + `@amiceli/vitest-cucumber` + `supertest`.

**Spec:** `war-spec.md` §3 (Users & Roles), §6.7 (Role grants), §8.5 (Abuse reporting) — see also `PROGRESS.md`'s "Designed but not specified" and backlog item 5 for what remains explicitly out of scope (broad admin dashboard).

## Global Constraints

- FluentAssertions is not used in this project (that constraint is .NET-only); no equivalent restriction applies here.
- Every test file uses `// Arrange`, `// Act`, `// Assert` comments (project convention, see `test/unit/warPresenter.test.ts`, `test/integration/votesRepository.test.ts`).
- TDD only: a failing test (acceptance/Gherkin preferred, unit/integration where acceptance isn't practical) before any production code, for every task below.
- After changing or adding any function, check its cyclomatic complexity; if it exceeds 5, report the function name and complexity value to the user rather than silently proceeding.
- All commands run from the repo root via `npm --prefix war-api ...` (no `cd`) — see root `CLAUDE.md`.
- Response bodies use snake_case keys (`war_id`, `filed_at`, …), matching every existing presenter (`warPresenter.ts`, `contestantPresenter.ts`).
- Reuse existing `HttpFailure` kinds (`notFound`, `forbidden`, `validationError`) from `shared/outcomes.ts` — no new kind is needed anywhere in this feature.

## Review Focus

- Filing a report against a War id that does not exist must 404, not silently succeed or 500 — spec says nothing about a missing War, but every other War-scoped mutation in this codebase 404s on one (Task 4).
- An empty or missing `explanation` must 422 and insert no row — mirrors the existing title/theme validation pattern in `warsService.ts` (Task 4).
- A War's own creator, with no Moderator/Admin role, must get 403 reading that War's reports — spec §8.5 is explicit that visibility has "no exception for the War's own creator" (Task 5).
- An Admin with `is_admin=true` but `is_moderator=false` must still pass the report-review gate — spec §8.5 says "Moderator/Admin only", not Moderator-only, so the gate must check either flag (Task 2, reused by Tasks 5–7).
- Deleting a War that has reports against it must not FK-violate and must leave no orphaned report rows afterward — `reports.war_id` has no cascade rule, like every other FK in `20260101000000_init.sql` (Task 8).

---

### Task 1: Voter roles — schema + repository

**Files:**
- Create: `war-api/db/migrations/20260111000000_add_roles_and_abuse_reports.sql`
- Modify: `war-api/src/db/types.ts`
- Modify: `war-api/src/auth/votersRepository.ts`
- Test: `war-api/test/integration/votersRepository.test.ts` (new)

**Interfaces:**
- Produces: `Voter { id, provider, providerUserId, displayName, avatarUrl, isModerator: boolean, isAdmin: boolean }` (extends the existing `Voter` in `votersRepository.ts`); `setVoterRole(db: Kysely<Database>, voterId: string, role: 'moderator' | 'admin', granted: boolean): Promise<Voter | undefined>` — `undefined` when `voterId` doesn't exist, used by later tasks to 404.

- [ ] **Step 1: Write the failing migration + integration test**

Create the migration first (both the `voters` role columns and the `reports` table — one coherent schema change for this whole feature; the `reports` table stays unused until Task 3, exactly like any other migration that lands ahead of the code that first queries it):

```sql
-- Up Migration

ALTER TABLE voters ADD COLUMN is_moderator BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE voters ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE reports (
  id          UUID PRIMARY KEY,
  war_id      UUID REFERENCES wars(id),
  reporter_id UUID REFERENCES voters(id),
  explanation TEXT NOT NULL,
  addressed   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON reports (war_id);
CREATE INDEX ON reports (war_id) WHERE addressed = false;

-- Down Migration

DROP TABLE IF EXISTS reports;
ALTER TABLE voters DROP COLUMN is_admin;
ALTER TABLE voters DROP COLUMN is_moderator;
```

Then the test:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { setVoterRole, findVoterById } from '../../src/auth/votersRepository.js';
import { makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

describe('setVoterRole (war-spec.md §3, §6.7)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  it('grants and revokes the admin role independently of the moderator role', async () => {
    // Arrange
    const voter = await makeVoter(harness.db, 'voter');

    // Act
    await setVoterRole(harness.db, voter.id, 'admin', true);
    const afterGrant = await findVoterById(harness.db, voter.id);
    await setVoterRole(harness.db, voter.id, 'admin', false);
    const afterRevoke = await findVoterById(harness.db, voter.id);

    // Assert
    expect(afterGrant?.isAdmin).toBe(true);
    expect(afterGrant?.isModerator).toBe(false);
    expect(afterRevoke?.isAdmin).toBe(false);
  });

  it('returns undefined for a voter id that does not exist', async () => {
    // Act
    const result = await setVoterRole(harness.db, '00000000-0000-0000-0000-000000000000', 'moderator', true);

    // Assert
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix war-api test -- -t "setVoterRole"`
Expected: FAIL — `setVoterRole` is not exported from `votersRepository.ts`, and `isAdmin`/`isModerator` don't exist on `Voter`.

- [ ] **Step 3: Apply the migration**

Run: `npm --prefix war-api run migrate`

- [ ] **Step 4: Add the columns to `db/types.ts`**

In `war-api/src/db/types.ts`, extend `VotersTable` and add `ReportsTable`:

```typescript
export interface VotersTable {
  id: string;
  provider: string;
  provider_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_moderator: Generated<boolean>;
  is_admin: Generated<boolean>;
  created_at: GeneratedTimestamp;
}

export interface ReportsTable {
  id: string;
  war_id: string;
  reporter_id: string;
  explanation: string;
  addressed: Generated<boolean>;
  created_at: GeneratedTimestamp;
}
```

And add `reports: ReportsTable;` to the `Database` interface.

- [ ] **Step 5: Implement `setVoterRole` and extend `Voter`/`toVoter` in `votersRepository.ts`**

```typescript
export interface Voter {
  id: string;
  provider: string;
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
  isModerator: boolean;
  isAdmin: boolean;
}

function toVoter(row: {
  id: string;
  provider: string;
  provider_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_moderator: boolean;
  is_admin: boolean;
}): Voter {
  return {
    id: row.id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isModerator: row.is_moderator,
    isAdmin: row.is_admin,
  };
}
```

(`findOrCreateVoter`'s two `toVoter(...)` call sites already pass whole rows via `selectAll()`/`returningAll()`, so they need no change beyond `toVoter` itself now reading two more columns.)

```typescript
/** Grants or revokes `role` on `voterId` (spec §6.7) — the only mutator of either role column. Returns `undefined` if no such voter exists, for callers to 404. */
export async function setVoterRole(
  db: Kysely<Database>,
  voterId: string,
  role: 'moderator' | 'admin',
  granted: boolean,
): Promise<Voter | undefined> {
  const values = role === 'admin' ? { is_admin: granted } : { is_moderator: granted };
  const row = await db.updateTable('voters').set(values).where('id', '=', voterId).returningAll().executeTakeFirst();
  return row ? toVoter(row) : undefined;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm --prefix war-api test -- -t "setVoterRole"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add war-api/db/migrations/20260111000000_add_roles_and_abuse_reports.sql war-api/src/db/types.ts war-api/src/auth/votersRepository.ts war-api/test/integration/votersRepository.test.ts
git commit -m "feat(war-api): add moderator/admin role columns and reports table"
```

---

### Task 2: Role grants — access control, service, route

**Files:**
- Create: `war-api/src/roles/rolesAccess.ts`
- Create: `war-api/src/roles/rolesService.ts`
- Create: `war-api/src/roles/routes.ts`
- Modify: `war-api/src/app.ts`
- Modify: `war-api/test/setup/fixtures.ts`
- Create: `war-api/specs/features/role-grants.feature`
- Create: `war-api/test/features/role-grants.steps.ts`

**Interfaces:**
- Consumes: `Voter`, `setVoterRole` (Task 1, `auth/votersRepository.ts`); `bearerAuthRoute`, `requireAuth` (`auth/plugin.ts`); `errorResponseSchema`, `validationErrorResponseSchema`, `replyForOutcome` (`shared/httpOutcomes.js`).
- Produces: `requireAdmin(db: Kysely<Database>)` and `requireModeratorOrAdmin(db: Kysely<Database>)` — both Fastify preHandler factories, 403 when the check fails, used as `bearerAuthRoute`'s `extraPreHandlers` by this task's own route and by Tasks 5–7's report-review routes. `grantRole(db, targetVoterId: string, role: 'moderator' | 'admin', granted: boolean): Promise<MutationOutcome<Voter>>`.

- [ ] **Step 1: Write the failing feature file**

`war-api/specs/features/role-grants.feature`:

```gherkin
Feature: Role grants

  Scenario: An Admin grants Moderator to a Voter
    Given an Admin and a plain Voter
    When the Admin PUTs granted true for the moderator role on that Voter
    Then the response status is 200
    And the Voter now has the moderator role

  Scenario: An Admin revokes Moderator from a Voter
    Given an Admin and a Voter who already has the moderator role
    When the Admin PUTs granted false for the moderator role on that Voter
    Then the response status is 200
    And the Voter no longer has the moderator role

  Scenario: A non-Admin cannot grant any role
    Given a plain Voter and another plain Voter
    When the first Voter PUTs granted true for the moderator role on the second
    Then the response status is 403

  Scenario: A Moderator alone cannot grant any role
    Given a Moderator and a plain Voter
    When the Moderator PUTs granted true for the admin role on the plain Voter
    Then the response status is 403

  Scenario: Granting a role on a nonexistent voter 404s
    Given an Admin
    When the Admin PUTs granted true for the moderator role on a nonexistent voter id
    Then the response status is 404
```

- [ ] **Step 2: Write the failing step definitions**

`war-api/test/features/role-grants.steps.ts`:

```typescript
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeAdmin, makeModerator } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/role-grants.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  async function putRole(callerId: string, targetId: string, role: string, granted: boolean): Promise<request.Response> {
    await harness.app.ready();
    const jwt = await harness.jwtFor(callerId);
    return request(harness.app.server)
      .put(`/api/v1/voters/${targetId}/roles/${role}`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ granted });
  }

  Scenario('An Admin grants Moderator to a Voter', ({ Given, When, Then, And }) => {
    let adminId: string;
    let targetId: string;
    let response: request.Response;

    Given('an Admin and a plain Voter', async () => {
      const admin = await makeAdmin(harness.db, 'admin');
      const target = await makeVoter(harness.db, 'target');
      adminId = admin.id;
      targetId = target.id;
    });

    When('the Admin PUTs granted true for the moderator role on that Voter', async () => {
      response = await putRole(adminId, targetId, 'moderator', true);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('the Voter now has the moderator role', () => {
      expect(response.body.is_moderator).toBe(true);
    });
  });

  Scenario('An Admin revokes Moderator from a Voter', ({ Given, When, Then, And }) => {
    let adminId: string;
    let targetId: string;
    let response: request.Response;

    Given('an Admin and a Voter who already has the moderator role', async () => {
      const admin = await makeAdmin(harness.db, 'admin');
      const target = await makeModerator(harness.db, 'target');
      adminId = admin.id;
      targetId = target.id;
    });

    When('the Admin PUTs granted false for the moderator role on that Voter', async () => {
      response = await putRole(adminId, targetId, 'moderator', false);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('the Voter no longer has the moderator role', () => {
      expect(response.body.is_moderator).toBe(false);
    });
  });

  Scenario('A non-Admin cannot grant any role', ({ Given, When, Then }) => {
    let callerId: string;
    let targetId: string;
    let response: request.Response;

    Given('a plain Voter and another plain Voter', async () => {
      const caller = await makeVoter(harness.db, 'caller');
      const target = await makeVoter(harness.db, 'target');
      callerId = caller.id;
      targetId = target.id;
    });

    When('the first Voter PUTs granted true for the moderator role on the second', async () => {
      response = await putRole(callerId, targetId, 'moderator', true);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('A Moderator alone cannot grant any role', ({ Given, When, Then }) => {
    let moderatorId: string;
    let targetId: string;
    let response: request.Response;

    Given('a Moderator and a plain Voter', async () => {
      const moderator = await makeModerator(harness.db, 'moderator');
      const target = await makeVoter(harness.db, 'target');
      moderatorId = moderator.id;
      targetId = target.id;
    });

    When('the Moderator PUTs granted true for the admin role on the plain Voter', async () => {
      response = await putRole(moderatorId, targetId, 'admin', true);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('Granting a role on a nonexistent voter 404s', ({ Given, When, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin', async () => {
      const admin = await makeAdmin(harness.db, 'admin');
      adminId = admin.id;
    });

    When('the Admin PUTs granted true for the moderator role on a nonexistent voter id', async () => {
      response = await putRole(adminId, '00000000-0000-0000-0000-000000000000', 'moderator', true);
    });

    Then('the response status is 404', () => {
      expect(response.status).toBe(404);
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix war-api test -- -t "Role grants"`
Expected: FAIL — `/api/v1/voters/:id/roles/:role` doesn't exist (404 from the app's own not-found handler on every scenario, or a connection error), and `makeAdmin`/`makeModerator` aren't exported from `fixtures.ts`.

- [ ] **Step 4: Add `makeAdmin`/`makeModerator` fixtures**

In `war-api/test/setup/fixtures.ts`, add (alongside the existing imports, add `setVoterRole` from `../../src/auth/votersRepository.js`):

```typescript
export async function makeAdmin(db: Kysely<Database>, seed: string): Promise<Voter> {
  const voter = await makeVoter(db, seed);
  const updated = await setVoterRole(db, voter.id, 'admin', true);
  return updated!;
}

export async function makeModerator(db: Kysely<Database>, seed: string): Promise<Voter> {
  const voter = await makeVoter(db, seed);
  const updated = await setVoterRole(db, voter.id, 'moderator', true);
  return updated!;
}
```

- [ ] **Step 5: Implement `rolesAccess.ts`**

```typescript
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { findVoterById } from '../auth/votersRepository.js';

/** Admin-only gate (spec §6.7) — 403s unless `request.voterId`'s voter has `isAdmin`. Run after `requireAuth` so `voterId` is already populated. */
export function requireAdmin(db: Kysely<Database>) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const voter = await findVoterById(db, request.voterId!);
    if (!voter?.isAdmin) {
      await reply.code(403).send({ error: 'forbidden' });
    }
  };
}

/** Moderator-or-Admin gate (spec §8.5: "Moderator/Admin only") — 403s unless the voter has either flag. */
export function requireModeratorOrAdmin(db: Kysely<Database>) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const voter = await findVoterById(db, request.voterId!);
    if (!voter?.isModerator && !voter?.isAdmin) {
      await reply.code(403).send({ error: 'forbidden' });
    }
  };
}
```

- [ ] **Step 6: Implement `rolesService.ts`**

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { MutationOutcome, NotFound } from '../shared/outcomes.js';
import { setVoterRole, type Voter } from '../auth/votersRepository.js';

export type GrantRoleOutcome = MutationOutcome<Voter, NotFound>;

/** Grants or revokes `role` on `targetVoterId` (spec §6.7). Caller-permission (Admin-only) is enforced by `requireAdmin`, not here. */
export async function grantRole(
  db: Kysely<Database>,
  targetVoterId: string,
  role: 'moderator' | 'admin',
  granted: boolean,
): Promise<GrantRoleOutcome> {
  const voter = await setVoterRole(db, targetVoterId, role, granted);
  return voter ? { kind: 'ok', value: voter } : { kind: 'notFound' };
}
```

- [ ] **Step 7: Implement `roles/routes.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { errorResponseSchema, replyForOutcome } from '../shared/httpOutcomes.js';
import { requireAdmin } from './rolesAccess.js';
import { grantRole } from './rolesService.js';

export interface RolesRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

const voterRoleViewSchema = {
  type: 'object',
  required: ['id', 'is_moderator', 'is_admin'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    is_moderator: { type: 'boolean' },
    is_admin: { type: 'boolean' },
  },
};

export function registerRolesRoutes(app: FastifyInstance, deps: RolesRouteDeps): void {
  const { db, auth } = deps;

  app.put<{ Params: { id: string; role: string }; Body: { granted: boolean } }>(
    '/voters/:id/roles/:role',
    bearerAuthRoute(
      auth,
      {
        params: {
          type: 'object',
          required: ['id', 'role'],
          properties: { id: { type: 'string' }, role: { type: 'string', enum: ['moderator', 'admin'] } },
        },
        body: { type: 'object', required: ['granted'], properties: { granted: { type: 'boolean' } } },
        response: { 200: voterRoleViewSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
      [requireAdmin(db)],
    ),
    async (request, reply) => {
      const outcome = await grantRole(db, request.params.id, request.params.role as 'moderator' | 'admin', request.body.granted);
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send({ id: outcome.value.id, is_moderator: outcome.value.isModerator, is_admin: outcome.value.isAdmin });
    },
  );
}
```

- [ ] **Step 8: Wire it into `app.ts`**

In `war-api/src/app.ts`, import and register alongside the other route modules:

```typescript
import { registerRolesRoutes } from './roles/routes.js';
```

```typescript
      registerRolesRoutes(instance, { db: deps.db, auth: authDeps });
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm --prefix war-api test -- -t "Role grants"`
Expected: PASS (5/5 scenarios)

- [ ] **Step 10: Check cyclomatic complexity**

`requireAdmin`, `requireModeratorOrAdmin`, `grantRole`, and the route handler are all single-branch or zero-branch; none should exceed complexity 5. Confirm and move on; report to the user only if one does.

- [ ] **Step 11: Commit**

```bash
git add war-api/src/roles war-api/src/app.ts war-api/test/setup/fixtures.ts war-api/specs/features/role-grants.feature war-api/test/features/role-grants.steps.ts
git commit -m "feat(war-api): add Admin-only role-grant endpoint for Moderator/Admin"
```

---

### Task 3: Reports repository

**Files:**
- Create: `war-api/src/reports/reportsRepository.ts`
- Test: `war-api/test/integration/reportsRepository.test.ts`

**Interfaces:**
- Consumes: `Database`, `newId` (`db/uuid.js`).
- Produces: `Report { id, warId, reporterId, explanation, addressed, createdAt }`; `createReport(db, { warId, reporterId, explanation }): Promise<Report>`; `listReportsForWar(db, warId): Promise<Report[]>` (newest first); `listWarsWithUnaddressedReports(db): Promise<{ warId: string; title: string | null; unaddressedCount: number }[]>`; `setReportAddressed(db, reportId, addressed): Promise<Report | undefined>`; `deleteReportsForWar(db, warId): Promise<void>` (used by Task 8, accepts a transaction too since `Kysely<Database>` and `Transaction<Database>` share the same query-building interface).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import {
  createReport,
  listReportsForWar,
  listWarsWithUnaddressedReports,
  setReportAddressed,
} from '../../src/reports/reportsRepository.js';
import { makeDraftWar, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

describe('reportsRepository (war-spec.md §8.5)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  it('accumulates every report against a War, newest first, and never deduplicates', async () => {
    // Arrange
    const creator = await makeVoter(harness.db, 'creator');
    const reporter = await makeVoter(harness.db, 'reporter');
    const war = await makeDraftWar(harness.db, creator.id);

    // Act
    await createReport(harness.db, { warId: war.id, reporterId: reporter.id, explanation: 'first' });
    await createReport(harness.db, { warId: war.id, reporterId: reporter.id, explanation: 'second' });
    const reports = await listReportsForWar(harness.db, war.id);

    // Assert
    expect(reports).toHaveLength(2);
    expect(reports[0].explanation).toBe('second');
    expect(reports[1].explanation).toBe('first');
    expect(reports.every((report) => report.addressed === false)).toBe(true);
  });

  it('lists only Wars carrying at least one unaddressed report, with the right count each', async () => {
    // Arrange
    const creator = await makeVoter(harness.db, 'creator');
    const reporter = await makeVoter(harness.db, 'reporter');
    const warWithUnaddressed = await makeDraftWar(harness.db, creator.id, { title: 'Needs review' });
    const warFullyAddressed = await makeDraftWar(harness.db, creator.id, { title: 'All clear' });
    const reportA = await createReport(harness.db, { warId: warWithUnaddressed.id, reporterId: reporter.id, explanation: 'a' });
    await createReport(harness.db, { warId: warWithUnaddressed.id, reporterId: reporter.id, explanation: 'b' });
    const reportC = await createReport(harness.db, { warId: warFullyAddressed.id, reporterId: reporter.id, explanation: 'c' });
    await setReportAddressed(harness.db, reportC.id, true);

    // Act
    const queue = await listWarsWithUnaddressedReports(harness.db);

    // Assert
    expect(queue).toEqual([{ warId: warWithUnaddressed.id, title: 'Needs review', unaddressedCount: 2 }]);
    expect(reportA.addressed).toBe(false);
  });

  it('toggles a report addressed state in either direction', async () => {
    // Arrange
    const creator = await makeVoter(harness.db, 'creator');
    const reporter = await makeVoter(harness.db, 'reporter');
    const war = await makeDraftWar(harness.db, creator.id);
    const report = await createReport(harness.db, { warId: war.id, reporterId: reporter.id, explanation: 'x' });

    // Act
    const addressed = await setReportAddressed(harness.db, report.id, true);
    const reopened = await setReportAddressed(harness.db, report.id, false);

    // Assert
    expect(addressed?.addressed).toBe(true);
    expect(reopened?.addressed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix war-api test -- -t "reportsRepository"`
Expected: FAIL — `src/reports/reportsRepository.ts` does not exist yet.

- [ ] **Step 3: Implement `reportsRepository.ts`**

```typescript
import type { Kysely, Selectable } from 'kysely';
import type { Database, ReportsTable } from '../db/types.js';
import { newId } from '../db/uuid.js';

export interface Report {
  id: string;
  warId: string;
  reporterId: string;
  explanation: string;
  addressed: boolean;
  createdAt: Date;
}

function toReport(row: Selectable<ReportsTable>): Report {
  return {
    id: row.id,
    warId: row.war_id,
    reporterId: row.reporter_id,
    explanation: row.explanation,
    addressed: row.addressed,
    createdAt: new Date(row.created_at),
  };
}

export interface CreateReportInput {
  warId: string;
  reporterId: string;
  explanation: string;
}

/** Inserts one report row. Never deduplicates against existing reports on the same War (spec §8.5: "reports are never deduplicated or merged"). */
export async function createReport(db: Kysely<Database>, input: CreateReportInput): Promise<Report> {
  const row = await db
    .insertInto('reports')
    .values({ id: newId(), war_id: input.warId, reporter_id: input.reporterId, explanation: input.explanation })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toReport(row);
}

/** Every report against `warId`, newest first (spec §8.5). */
export async function listReportsForWar(db: Kysely<Database>, warId: string): Promise<Report[]> {
  const rows = await db
    .selectFrom('reports')
    .selectAll()
    .where('war_id', '=', warId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  return rows.map((row) => toReport(row));
}

export interface UnaddressedWarQueueEntry {
  warId: string;
  title: string | null;
  unaddressedCount: number;
}

/** The moderation queue (spec §8.5): every War carrying ≥1 unaddressed report, with that count, ordered by title. */
export async function listWarsWithUnaddressedReports(db: Kysely<Database>): Promise<UnaddressedWarQueueEntry[]> {
  const rows = await db
    .selectFrom('reports')
    .innerJoin('wars', 'wars.id', 'reports.war_id')
    .select(['reports.war_id as warId', 'wars.title as title'])
    .select((eb) => eb.fn.count<string>('reports.id').as('unaddressedCount'))
    .where('reports.addressed', '=', false)
    .groupBy(['reports.war_id', 'wars.title'])
    .orderBy('wars.title')
    .execute();
  return rows.map((row) => ({ warId: row.warId, title: row.title, unaddressedCount: Number(row.unaddressedCount) }));
}

/** Toggles one report's `addressed` flag (spec §8.5: "in either direction"). `undefined` if `reportId` doesn't exist. */
export async function setReportAddressed(db: Kysely<Database>, reportId: string, addressed: boolean): Promise<Report | undefined> {
  const row = await db
    .updateTable('reports')
    .set({ addressed })
    .where('id', '=', reportId)
    .returningAll()
    .executeTakeFirst();
  return row ? toReport(row) : undefined;
}

/** Deletes every report against `warId` — used only by War deletion's cascade (Task 8), since `reports.war_id` carries no `ON DELETE` rule. */
export async function deleteReportsForWar(db: Kysely<Database>, warId: string): Promise<void> {
  await db.deleteFrom('reports').where('war_id', '=', warId).execute();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix war-api test -- -t "reportsRepository"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add war-api/src/reports/reportsRepository.ts war-api/test/integration/reportsRepository.test.ts
git commit -m "feat(war-api): add reports repository"
```

---

### Task 4: File an abuse report

**Files:**
- Create: `war-api/src/reports/reportsService.ts`
- Create: `war-api/src/reports/routes.ts`
- Create: `war-api/specs/features/abuse-reporting.feature`
- Create: `war-api/test/features/abuse-reporting.steps.ts`
- Modify: `war-api/src/app.ts`

**Interfaces:**
- Consumes: `createReport`, `Report` (Task 3); `findWarById` (`wars/warsRepository.js`); `bearerAuthRoute` (`auth/plugin.js`); `MutationOutcome`, `NotFound`, `ValidationError` (`shared/outcomes.js`).
- Produces: `fileReport(db, { warId, reporterId, explanation }): Promise<MutationOutcome<Report>>`; the `ReportView` JSON shape `{ id, war_id, reporter_id, explanation, addressed, filed_at }` and its schema, exported for reuse by Task 5.

- [ ] **Step 1: Write the failing feature file**

`war-api/specs/features/abuse-reporting.feature`:

```gherkin
Feature: Abuse reporting

  Scenario: Any authenticated Voter can report a War
    Given an authenticated Voter and a War created by someone else
    When they POST an explanation to that War's reports
    Then the response status is 201
    And the response carries the explanation and the reporter's id
    And the report's addressed state is false

  Scenario: A Voter may report the same War more than once
    Given an authenticated Voter and a War
    When they POST two different explanations to that War's reports
    Then both requests succeed
    And two separate reports exist against that War

  Scenario: An empty explanation is rejected
    Given an authenticated Voter and a War
    When they POST an empty-string explanation to that War's reports
    Then the response status is 422
    And no report is created

  Scenario: Reporting a nonexistent War 404s
    Given an authenticated Voter
    When they POST an explanation to a nonexistent War's reports
    Then the response status is 404

  Scenario: An unauthenticated request cannot file a report
    Given a request with no Authorization header
    When they POST an explanation to a War's reports
    Then the response status is 401
```

- [ ] **Step 2: Write the failing step definitions**

`war-api/test/features/abuse-reporting.steps.ts`:

```typescript
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeDraftWar, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/abuse-reporting.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  async function postReport(voterId: string | undefined, warId: string, explanation: string | undefined): Promise<request.Response> {
    await harness.app.ready();
    const req = request(harness.app.server).post(`/api/v1/wars/${warId}/reports`);
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req.send(explanation === undefined ? {} : { explanation });
  }

  Scenario('Any authenticated Voter can report a War', ({ Given, When, Then, And }) => {
    let reporterId: string;
    let warId: string;
    let response: request.Response;

    Given('an authenticated Voter and a War created by someone else', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const war = await makeDraftWar(harness.db, creator.id);
      reporterId = reporter.id;
      warId = war.id;
    });

    When("they POST an explanation to that War's reports", async () => {
      response = await postReport(reporterId, warId, 'votes look spammed');
    });

    Then('the response status is 201', () => {
      expect(response.status).toBe(201);
    });

    And("the response carries the explanation and the reporter's id", () => {
      expect(response.body.explanation).toBe('votes look spammed');
      expect(response.body.reporter_id).toBe(reporterId);
    });

    And("the report's addressed state is false", () => {
      expect(response.body.addressed).toBe(false);
    });
  });

  Scenario('A Voter may report the same War more than once', ({ Given, When, Then, And }) => {
    let reporterId: string;
    let warId: string;
    let first: request.Response;
    let second: request.Response;

    Given('an authenticated Voter and a War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const war = await makeDraftWar(harness.db, creator.id);
      reporterId = reporter.id;
      warId = war.id;
    });

    When('they POST two different explanations to that War\'s reports', async () => {
      first = await postReport(reporterId, warId, 'first issue');
      second = await postReport(reporterId, warId, 'second issue');
    });

    Then('both requests succeed', () => {
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });

    And('two separate reports exist against that War', async () => {
      const rows = await harness.db.selectFrom('reports').selectAll().where('war_id', '=', warId).execute();
      expect(rows).toHaveLength(2);
    });
  });

  Scenario('An empty explanation is rejected', ({ Given, When, Then, And }) => {
    let reporterId: string;
    let warId: string;
    let response: request.Response;

    Given('an authenticated Voter and a War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const war = await makeDraftWar(harness.db, creator.id);
      reporterId = reporter.id;
      warId = war.id;
    });

    When('they POST an empty-string explanation to that War\'s reports', async () => {
      response = await postReport(reporterId, warId, '');
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('no report is created', async () => {
      const rows = await harness.db.selectFrom('reports').selectAll().where('war_id', '=', warId).execute();
      expect(rows).toHaveLength(0);
    });
  });

  Scenario('Reporting a nonexistent War 404s', ({ Given, When, Then }) => {
    let reporterId: string;
    let response: request.Response;

    Given('an authenticated Voter', async () => {
      const reporter = await makeVoter(harness.db, 'reporter');
      reporterId = reporter.id;
    });

    When("they POST an explanation to a nonexistent War's reports", async () => {
      response = await postReport(reporterId, '00000000-0000-0000-0000-000000000000', 'anything');
    });

    Then('the response status is 404', () => {
      expect(response.status).toBe(404);
    });
  });

  Scenario('An unauthenticated request cannot file a report', ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a request with no Authorization header', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const war = await makeDraftWar(harness.db, creator.id);
      warId = war.id;
    });

    When("they POST an explanation to a War's reports", async () => {
      response = await postReport(undefined, warId, 'anything');
    });

    Then('the response status is 401', () => {
      expect(response.status).toBe(401);
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix war-api test -- -t "Abuse reporting"`
Expected: FAIL — `POST /api/v1/wars/:id/reports` doesn't exist.

- [ ] **Step 4: Implement `reportsService.ts`**

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { MutationOutcome, NotFound, ValidationError } from '../shared/outcomes.js';
import { findWarById } from '../wars/warsRepository.js';
import { createReport, type Report } from './reportsRepository.js';

export interface ReportView {
  id: string;
  war_id: string;
  reporter_id: string;
  explanation: string;
  addressed: boolean;
  filed_at: string;
}

export const reportViewSchema = {
  type: 'object',
  required: ['id', 'war_id', 'reporter_id', 'explanation', 'addressed', 'filed_at'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    war_id: { type: 'string', format: 'uuid' },
    reporter_id: { type: 'string', format: 'uuid' },
    explanation: { type: 'string' },
    addressed: { type: 'boolean' },
    filed_at: { type: 'string', format: 'date-time' },
  },
};

export function presentReport(report: Report): ReportView {
  return {
    id: report.id,
    war_id: report.warId,
    reporter_id: report.reporterId,
    explanation: report.explanation,
    addressed: report.addressed,
    filed_at: report.createdAt.toISOString(),
  };
}

function explanationError(explanation: unknown): string | null {
  if (typeof explanation !== 'string' || explanation.length === 0) {
    return 'explanation must be a non-empty string';
  }
  return null;
}

export interface FileReportInput {
  warId: string;
  reporterId: string;
  explanation: unknown;
}

export type FileReportOutcome = MutationOutcome<Report, NotFound | ValidationError>;

/** Files one abuse report (spec §8.5) — any authenticated Voter, any War, any number of times; never deduplicated. */
export async function fileReport(db: Kysely<Database>, input: FileReportInput): Promise<FileReportOutcome> {
  const war = await findWarById(db, input.warId);
  if (!war) return { kind: 'notFound' };

  const error = explanationError(input.explanation);
  if (error) return { kind: 'validationError', errors: [error] };

  const report = await createReport(db, { warId: input.warId, reporterId: input.reporterId, explanation: input.explanation as string });
  return { kind: 'ok', value: report };
}
```

- [ ] **Step 5: Implement `reports/routes.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { errorResponseSchema, replyForOutcome, validationErrorResponseSchema } from '../shared/httpOutcomes.js';
import { fileReport, presentReport, reportViewSchema } from './reportsService.js';

export interface ReportsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

export function registerReportsRoutes(app: FastifyInstance, deps: ReportsRouteDeps): void {
  const { db, auth } = deps;

  app.post<{ Params: { id: string } }>(
    '/wars/:id/reports',
    bearerAuthRoute(auth, {
      body: { type: 'object', properties: { explanation: { type: 'string' } } },
      response: {
        201: reportViewSchema,
        404: errorResponseSchema,
        422: validationErrorResponseSchema,
      },
    }),
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const outcome = await fileReport(db, { warId: request.params.id, reporterId: request.voterId!, explanation: body.explanation });
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.code(201).send(presentReport(outcome.value));
    },
  );
}
```

- [ ] **Step 6: Wire it into `app.ts`**

```typescript
import { registerReportsRoutes } from './reports/routes.js';
```

```typescript
      registerReportsRoutes(instance, { db: deps.db, auth: authDeps });
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm --prefix war-api test -- -t "Abuse reporting"`
Expected: PASS (5/5 scenarios)

- [ ] **Step 8: Commit**

```bash
git add war-api/src/reports/reportsService.ts war-api/src/reports/routes.ts war-api/src/app.ts war-api/specs/features/abuse-reporting.feature war-api/test/features/abuse-reporting.steps.ts
git commit -m "feat(war-api): let any Voter file an abuse report against a War"
```

---

### Task 5: List reports for a War (Moderator/Admin only)

**Files:**
- Modify: `war-api/src/reports/reportsService.ts`
- Modify: `war-api/src/reports/routes.ts`
- Modify: `war-api/specs/features/abuse-reporting.feature`
- Modify: `war-api/test/features/abuse-reporting.steps.ts`

**Interfaces:**
- Consumes: `listReportsForWar` (Task 3); `requireModeratorOrAdmin` (Task 2); `presentReport`, `reportViewSchema` (Task 4).
- Produces: `listReportsForWarOutcome(db, warId): Promise<MutationOutcome<Report[], NotFound>>`.

- [ ] **Step 1: Add the failing scenarios**

Append to `war-api/specs/features/abuse-reporting.feature`:

```gherkin
  Scenario: A Moderator lists every report against a War
    Given a War with two reports against it and a Moderator
    When the Moderator GETs that War's reports
    Then the response status is 200
    And both reports are listed, newest first

  Scenario: The War's own creator cannot see its reports
    Given a War with a report against it
    When its creator GETs that War's reports
    Then the response status is 403

  Scenario: A plain Voter cannot list reports for a War
    Given a War with a report against it and a plain Voter
    When the plain Voter GETs that War's reports
    Then the response status is 403
```

- [ ] **Step 2: Add the failing step definitions**

Append inside the same `describeFeature` block in `war-api/test/features/abuse-reporting.steps.ts` (add `makeModerator` to the existing `fixtures.js` import; the new scenarios reuse the `postReport` helper Task 4 already defined):

```typescript
  async function getReports(voterId: string | undefined, warId: string): Promise<request.Response> {
    await harness.app.ready();
    const req = request(harness.app.server).get(`/api/v1/wars/${warId}/reports`);
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req;
  }

  Scenario('A Moderator lists every report against a War', ({ Given, When, Then, And }) => {
    let moderatorId: string;
    let warId: string;
    let response: request.Response;

    Given('a War with two reports against it and a Moderator', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const moderator = await makeModerator(harness.db, 'moderator');
      const war = await makeDraftWar(harness.db, creator.id);
      await postReport(reporter.id, war.id, 'first');
      await postReport(reporter.id, war.id, 'second');
      moderatorId = moderator.id;
      warId = war.id;
    });

    When("the Moderator GETs that War's reports", async () => {
      response = await getReports(moderatorId, warId);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('both reports are listed, newest first', () => {
      expect(response.body.reports).toHaveLength(2);
      expect(response.body.reports[0].explanation).toBe('second');
      expect(response.body.reports[1].explanation).toBe('first');
    });
  });

  Scenario("The War's own creator cannot see its reports", ({ Given, When, Then }) => {
    let creatorId: string;
    let warId: string;
    let response: request.Response;

    Given('a War with a report against it', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const war = await makeDraftWar(harness.db, creator.id);
      await postReport(reporter.id, war.id, 'an issue');
      creatorId = creator.id;
      warId = war.id;
    });

    When("its creator GETs that War's reports", async () => {
      response = await getReports(creatorId, warId);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('A plain Voter cannot list reports for a War', ({ Given, When, Then }) => {
    let voterId: string;
    let warId: string;
    let response: request.Response;

    Given('a War with a report against it and a plain Voter', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const plainVoter = await makeVoter(harness.db, 'plain');
      const war = await makeDraftWar(harness.db, creator.id);
      await postReport(reporter.id, war.id, 'an issue');
      voterId = plainVoter.id;
      warId = war.id;
    });

    When('the plain Voter GETs that War\'s reports', async () => {
      response = await getReports(voterId, warId);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });
```

(Also add `makeModerator` to the existing `import { makeDraftWar, makeVoter } from '../setup/fixtures.js';` line at the top of the file.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix war-api test -- -t "Abuse reporting"`
Expected: FAIL — `GET /api/v1/wars/:id/reports` doesn't exist yet.

- [ ] **Step 4: Add `listReportsForWarOutcome` to `reportsService.ts`**

```typescript
export type ListReportsOutcome = MutationOutcome<Report[], NotFound>;

/** Every report against `warId`, newest first (spec §8.5). 404s if the War itself doesn't exist; caller permission (Moderator/Admin) is enforced by `requireModeratorOrAdmin`, not here. */
export async function listReportsForWarOutcome(db: Kysely<Database>, warId: string): Promise<ListReportsOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };

  const reports = await listReportsForWar(db, warId);
  return { kind: 'ok', value: reports };
}
```

(Add `listReportsForWar` to the existing `./reportsRepository.js` import.)

- [ ] **Step 5: Add the route to `reports/routes.ts`**

```typescript
  app.get<{ Params: { id: string } }>(
    '/wars/:id/reports',
    bearerAuthRoute(
      auth,
      {
        response: {
          200: {
            type: 'object',
            required: ['reports'],
            properties: { reports: { type: 'array', items: reportViewSchema } },
          },
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      const outcome = await listReportsForWarOutcome(db, request.params.id);
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send({ reports: outcome.value.map(presentReport) });
    },
  );
```

(Add `listReportsForWarOutcome` to the `./reportsService.js` import, and `requireModeratorOrAdmin` from `../roles/rolesAccess.js`.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix war-api test -- -t "Abuse reporting"`
Expected: PASS (8/8 scenarios)

- [ ] **Step 7: Commit**

```bash
git add war-api/src/reports/reportsService.ts war-api/src/reports/routes.ts war-api/specs/features/abuse-reporting.feature war-api/test/features/abuse-reporting.steps.ts
git commit -m "feat(war-api): let Moderators/Admins list reports for a War"
```

---

### Task 6: Unaddressed-reports queue (Moderator/Admin only)

**Files:**
- Modify: `war-api/src/reports/reportsService.ts`
- Modify: `war-api/src/reports/routes.ts`
- Modify: `war-api/specs/features/abuse-reporting.feature`
- Modify: `war-api/test/features/abuse-reporting.steps.ts`

**Interfaces:**
- Consumes: `listWarsWithUnaddressedReports` (Task 3); `requireModeratorOrAdmin` (Task 2).
- Produces: the `GET /reports/unaddressed` route; `UnaddressedWarView { war_id, title, unaddressed_count }`.

- [ ] **Step 1: Add the failing scenarios**

Append to `war-api/specs/features/abuse-reporting.feature`:

```gherkin
  Scenario: A Moderator sees only Wars with unaddressed reports
    Given one War with an unaddressed report and another whose only report is addressed
    When the Moderator GETs the unaddressed-reports queue
    Then the response status is 200
    And only the War with the unaddressed report is listed

  Scenario: An Admin without the Moderator flag can also read the queue
    Given an Admin and a War with an unaddressed report
    When the Admin GETs the unaddressed-reports queue
    Then the response status is 200

  Scenario: A plain Voter cannot read the queue
    Given a plain Voter
    When the plain Voter GETs the unaddressed-reports queue
    Then the response status is 403
```

- [ ] **Step 2: Add the failing step definitions**

Append to `war-api/test/features/abuse-reporting.steps.ts` (add `makeAdmin` to the `fixtures.js` import):

```typescript
  async function getQueue(voterId: string | undefined): Promise<request.Response> {
    await harness.app.ready();
    const req = request(harness.app.server).get('/api/v1/reports/unaddressed');
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req;
  }

  Scenario('A Moderator sees only Wars with unaddressed reports', ({ Given, When, Then, And }) => {
    let moderatorId: string;
    let unaddressedWarId: string;
    let response: request.Response;

    Given('one War with an unaddressed report and another whose only report is addressed', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const moderator = await makeModerator(harness.db, 'moderator');
      const warNeedingReview = await makeDraftWar(harness.db, creator.id, { title: 'Needs review' });
      const warAllClear = await makeDraftWar(harness.db, creator.id, { title: 'All clear' });
      await postReport(reporter.id, warNeedingReview.id, 'still open');
      const addressedReport = await postReport(reporter.id, warAllClear.id, 'resolved already');
      await harness.db.updateTable('reports').set({ addressed: true }).where('id', '=', addressedReport.body.id).execute();
      moderatorId = moderator.id;
      unaddressedWarId = warNeedingReview.id;
    });

    When('the Moderator GETs the unaddressed-reports queue', async () => {
      response = await getQueue(moderatorId);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('only the War with the unaddressed report is listed', () => {
      expect(response.body.wars).toHaveLength(1);
      expect(response.body.wars[0].war_id).toBe(unaddressedWarId);
      expect(response.body.wars[0].unaddressed_count).toBe(1);
    });
  });

  Scenario('An Admin without the Moderator flag can also read the queue', ({ Given, When, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin and a War with an unaddressed report', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const admin = await makeAdmin(harness.db, 'admin');
      const war = await makeDraftWar(harness.db, creator.id);
      await postReport(reporter.id, war.id, 'an issue');
      adminId = admin.id;
    });

    When('the Admin GETs the unaddressed-reports queue', async () => {
      response = await getQueue(adminId);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });
  });

  Scenario('A plain Voter cannot read the queue', ({ Given, When, Then }) => {
    let voterId: string;
    let response: request.Response;

    Given('a plain Voter', async () => {
      const voter = await makeVoter(harness.db, 'plain');
      voterId = voter.id;
    });

    When('the plain Voter GETs the unaddressed-reports queue', async () => {
      response = await getQueue(voterId);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix war-api test -- -t "Abuse reporting"`
Expected: FAIL — `GET /api/v1/reports/unaddressed` doesn't exist yet.

- [ ] **Step 4: Add the service function**

In `reportsService.ts` (add `listWarsWithUnaddressedReports`, `type UnaddressedWarQueueEntry` to the `./reportsRepository.js` import):

```typescript
export interface UnaddressedWarView {
  war_id: string;
  title: string | null;
  unaddressed_count: number;
}

export const unaddressedWarViewSchema = {
  type: 'object',
  required: ['war_id', 'title', 'unaddressed_count'],
  properties: {
    war_id: { type: 'string', format: 'uuid' },
    title: { type: ['string', 'null'] },
    unaddressed_count: { type: 'integer', minimum: 1 },
  },
};

/** The moderation queue (spec §8.5) — never fails; an empty result just means nothing is waiting. */
export async function unaddressedQueue(db: Kysely<Database>): Promise<UnaddressedWarView[]> {
  const entries = await listWarsWithUnaddressedReports(db);
  return entries.map((entry) => ({ war_id: entry.warId, title: entry.title, unaddressed_count: entry.unaddressedCount }));
}
```

- [ ] **Step 5: Add the route**

In `reports/routes.ts` (add `unaddressedQueue`, `unaddressedWarViewSchema` to the `./reportsService.js` import):

```typescript
  app.get(
    '/reports/unaddressed',
    bearerAuthRoute(
      auth,
      {
        response: {
          200: { type: 'object', required: ['wars'], properties: { wars: { type: 'array', items: unaddressedWarViewSchema } } },
          403: errorResponseSchema,
        },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (_request, reply) => {
      const wars = await unaddressedQueue(db);
      return reply.send({ wars });
    },
  );
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix war-api test -- -t "Abuse reporting"`
Expected: PASS (11/11 scenarios)

- [ ] **Step 7: Commit**

```bash
git add war-api/src/reports/reportsService.ts war-api/src/reports/routes.ts war-api/specs/features/abuse-reporting.feature war-api/test/features/abuse-reporting.steps.ts
git commit -m "feat(war-api): add the unaddressed-reports moderation queue"
```

---

### Task 7: Set a report's addressed state (Moderator/Admin only)

**Files:**
- Modify: `war-api/src/reports/reportsService.ts`
- Modify: `war-api/src/reports/routes.ts`
- Modify: `war-api/specs/features/abuse-reporting.feature`
- Modify: `war-api/test/features/abuse-reporting.steps.ts`

**Interfaces:**
- Consumes: `setReportAddressed` (Task 3); `requireModeratorOrAdmin` (Task 2).
- Produces: `setAddressed(db, reportId, addressed): Promise<MutationOutcome<Report, NotFound>>`; the `PATCH /reports/:id` route.

- [ ] **Step 1: Add the failing scenarios**

Append to `war-api/specs/features/abuse-reporting.feature`:

```gherkin
  Scenario: A Moderator marks a report addressed
    Given a Moderator and an unaddressed report
    When the Moderator PATCHes that report's addressed state to true
    Then the response status is 200
    And the report's addressed state is now true

  Scenario: A Moderator reopens a report addressed in error
    Given a Moderator and a report already marked addressed
    When the Moderator PATCHes that report's addressed state to false
    Then the response status is 200
    And the report's addressed state is now false

  Scenario: A plain Voter cannot change a report's addressed state
    Given a plain Voter and an unaddressed report
    When the plain Voter PATCHes that report's addressed state to true
    Then the response status is 403

  Scenario: Addressing a nonexistent report 404s
    Given a Moderator
    When the Moderator PATCHes a nonexistent report's addressed state to true
    Then the response status is 404
```

- [ ] **Step 2: Add the failing step definitions**

Append to `war-api/test/features/abuse-reporting.steps.ts`:

```typescript
  async function patchAddressed(voterId: string | undefined, reportId: string, addressed: boolean): Promise<request.Response> {
    await harness.app.ready();
    const req = request(harness.app.server).patch(`/api/v1/reports/${reportId}`);
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req.send({ addressed });
  }

  Scenario('A Moderator marks a report addressed', ({ Given, When, Then, And }) => {
    let moderatorId: string;
    let reportId: string;
    let response: request.Response;

    Given('a Moderator and an unaddressed report', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const moderator = await makeModerator(harness.db, 'moderator');
      const war = await makeDraftWar(harness.db, creator.id);
      const filed = await postReport(reporter.id, war.id, 'an issue');
      moderatorId = moderator.id;
      reportId = filed.body.id;
    });

    When("the Moderator PATCHes that report's addressed state to true", async () => {
      response = await patchAddressed(moderatorId, reportId, true);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And("the report's addressed state is now true", () => {
      expect(response.body.addressed).toBe(true);
    });
  });

  Scenario('A Moderator reopens a report addressed in error', ({ Given, When, Then, And }) => {
    let moderatorId: string;
    let reportId: string;
    let response: request.Response;

    Given('a Moderator and a report already marked addressed', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const moderator = await makeModerator(harness.db, 'moderator');
      const war = await makeDraftWar(harness.db, creator.id);
      const filed = await postReport(reporter.id, war.id, 'an issue');
      await patchAddressed(moderator.id, filed.body.id, true);
      moderatorId = moderator.id;
      reportId = filed.body.id;
    });

    When("the Moderator PATCHes that report's addressed state to false", async () => {
      response = await patchAddressed(moderatorId, reportId, false);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And("the report's addressed state is now false", () => {
      expect(response.body.addressed).toBe(false);
    });
  });

  Scenario("A plain Voter cannot change a report's addressed state", ({ Given, When, Then }) => {
    let voterId: string;
    let reportId: string;
    let response: request.Response;

    Given('a plain Voter and an unaddressed report', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const plainVoter = await makeVoter(harness.db, 'plain');
      const war = await makeDraftWar(harness.db, creator.id);
      const filed = await postReport(reporter.id, war.id, 'an issue');
      voterId = plainVoter.id;
      reportId = filed.body.id;
    });

    When("the plain Voter PATCHes that report's addressed state to true", async () => {
      response = await patchAddressed(voterId, reportId, true);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('Addressing a nonexistent report 404s', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      const moderator = await makeModerator(harness.db, 'moderator');
      moderatorId = moderator.id;
    });

    When("the Moderator PATCHes a nonexistent report's addressed state to true", async () => {
      response = await patchAddressed(moderatorId, '00000000-0000-0000-0000-000000000000', true);
    });

    Then('the response status is 404', () => {
      expect(response.status).toBe(404);
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix war-api test -- -t "Abuse reporting"`
Expected: FAIL — `PATCH /api/v1/reports/:id` doesn't exist yet.

- [ ] **Step 4: Add the service function**

In `reportsService.ts` (add `setReportAddressed` to the `./reportsRepository.js` import):

```typescript
export type SetAddressedOutcome = MutationOutcome<Report, NotFound>;

/** Toggles one report's addressed flag (spec §8.5). Caller permission (Moderator/Admin) is enforced by `requireModeratorOrAdmin`, not here. */
export async function setAddressed(db: Kysely<Database>, reportId: string, addressed: boolean): Promise<SetAddressedOutcome> {
  const report = await setReportAddressed(db, reportId, addressed);
  return report ? { kind: 'ok', value: report } : { kind: 'notFound' };
}
```

- [ ] **Step 5: Add the route**

In `reports/routes.ts` (add `setAddressed` to the `./reportsService.js` import):

```typescript
  app.patch<{ Params: { id: string }; Body: { addressed: boolean } }>(
    '/reports/:id',
    bearerAuthRoute(
      auth,
      {
        body: { type: 'object', required: ['addressed'], properties: { addressed: { type: 'boolean' } } },
        response: { 200: reportViewSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      const outcome = await setAddressed(db, request.params.id, request.body.addressed);
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send(presentReport(outcome.value));
    },
  );
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix war-api test -- -t "Abuse reporting"`
Expected: PASS (15/15 scenarios)

- [ ] **Step 7: Commit**

```bash
git add war-api/src/reports/reportsService.ts war-api/src/reports/routes.ts war-api/specs/features/abuse-reporting.feature war-api/test/features/abuse-reporting.steps.ts
git commit -m "feat(war-api): let Moderators/Admins mark reports addressed or reopen them"
```

---

### Task 8: War deletion cascades to its reports

**Files:**
- Modify: `war-api/src/wars/warsRepository.ts`
- Test: `war-api/test/integration/reportsRepository.test.ts`

**Interfaces:**
- Consumes: `deleteReportsForWar` (Task 3).
- Produces: no new exports — `deleteWarRow` (existing) now also removes the War's reports.

- [ ] **Step 1: Write the failing test**

Append to `war-api/test/integration/reportsRepository.test.ts`:

```typescript
import { deleteWarRow } from '../../src/wars/warsRepository.js';

// ...inside the existing describe block:

  it('is removed entirely when its War is deleted (war-spec.md §8.5, no FK cascade on reports.war_id)', async () => {
    // Arrange
    const creator = await makeVoter(harness.db, 'creator');
    const reporter = await makeVoter(harness.db, 'reporter');
    const war = await makeDraftWar(harness.db, creator.id);
    await createReport(harness.db, { warId: war.id, reporterId: reporter.id, explanation: 'an issue' });

    // Act
    await deleteWarRow(harness.db, war.id);

    // Assert
    const remaining = await harness.db.selectFrom('reports').selectAll().where('war_id', '=', war.id).execute();
    expect(remaining).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix war-api test -- -t "is removed entirely when its War is deleted"`
Expected: FAIL — Postgres raises a foreign-key violation on `reports.war_id` when `deleteWarRow` deletes the `wars` row while a report still references it.

- [ ] **Step 3: Update `deleteWarRow`**

In `war-api/src/wars/warsRepository.ts`, import `deleteReportsForWar` from `../reports/reportsRepository.js` and call it inside the existing transaction, before the `wars` row itself is deleted:

```typescript
    await trx.deleteFrom('contestants').where('war_id', '=', warId).execute();
    await trx.deleteFrom('war_memberships').where('war_id', '=', warId).execute();
    await deleteReportsForWar(trx, warId);
    await trx.deleteFrom('wars').where('id', '=', warId).execute();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix war-api test -- -t "is removed entirely when its War is deleted"`
Expected: PASS

- [ ] **Step 5: Run the full war-api suite**

Run: `npm --prefix war-api test`
Expected: PASS (no regressions in the existing War-deletion scenarios)

- [ ] **Step 6: Commit**

```bash
git add war-api/src/wars/warsRepository.ts war-api/test/integration/reportsRepository.test.ts
git commit -m "fix(war-api): delete a War's reports when the War itself is deleted"
```

---

### Task 9: Seed script for the first Admin

**Files:**
- Create: `war-api/scripts/seedAdmin.ts`
- Modify: `war-api/package.json`
- Test: `war-api/test/integration/seedAdmin.test.ts`

**Interfaces:**
- Consumes: `setVoterRole` (Task 1); `createDb` (`db/index.js`); `loadConfig` (`config.js`).
- Produces: `seedAdmin(db: Kysely<Database>, voterId: string): Promise<Voter | undefined>` (exported for the test; `main()` is a thin CLI wrapper around it, per `scripts/dumpOpenApi.ts`'s existing split between a testable function and its CLI entry point).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { seedAdmin } from '../../scripts/seedAdmin.js';
import { makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

describe('seedAdmin (war-spec.md §6.7, first-Admin bootstrap)', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  it('grants the admin role to the given voter id', async () => {
    // Arrange
    const voter = await makeVoter(harness.db, 'first-admin');

    // Act
    const result = await seedAdmin(harness.db, voter.id);

    // Assert
    expect(result?.isAdmin).toBe(true);
  });

  it('returns undefined for a voter id that does not exist', async () => {
    // Act
    const result = await seedAdmin(harness.db, '00000000-0000-0000-0000-000000000000');

    // Assert
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix war-api test -- -t "seedAdmin"`
Expected: FAIL — `war-api/scripts/seedAdmin.ts` does not exist.

- [ ] **Step 3: Implement `scripts/seedAdmin.ts`**

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '../src/db/types.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import { setVoterRole, type Voter } from '../src/auth/votersRepository.js';

/** Grants the admin role to `voterId` (spec §6.7). The only way to create the first Admin on a fresh deployment, since no Admin yet exists to call the grant endpoint. */
export async function seedAdmin(db: Kysely<Database>, voterId: string): Promise<Voter | undefined> {
  return setVoterRole(db, voterId, 'admin', true);
}

async function main(): Promise<void> {
  const voterId = process.argv[2];
  if (!voterId) {
    console.error('Usage: npm run seed-admin -- <voterId>');
    process.exit(1);
  }

  const config = loadConfig();
  const db = createDb(config.databaseUrl);
  const result = await seedAdmin(db, voterId);
  await db.destroy();

  if (!result) {
    console.error(`No voter found with id ${voterId}`);
    process.exit(1);
  }
  console.log(`Granted admin to voter ${voterId}`);
}

if (process.argv[1]?.endsWith('seedAdmin.js')) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add the `package.json` script**

In `war-api/package.json`'s `"scripts"`, alongside `"dump-openapi"`:

```json
    "seed-admin": "tsc -p tsconfig.json && node dist/scripts/seedAdmin.js"
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix war-api test -- -t "seedAdmin"`
Expected: PASS

- [ ] **Step 6: Run the full war-api suite, lint, and typecheck**

Run: `npm --prefix war-api test && npm --prefix war-api run lint && npm --prefix war-api run typecheck`
Expected: all pass, zero regressions

- [ ] **Step 7: Commit**

```bash
git add war-api/scripts/seedAdmin.ts war-api/package.json war-api/test/integration/seedAdmin.test.ts
git commit -m "feat(war-api): add seed-admin script to bootstrap the first Admin"
```

---

## Out of scope (see `war-spec.md` §2, `PROGRESS.md`)

No war-ui-default work is in this plan — the brainstorming pass covered only the war-api surface (§3, §6.7, §8.5), with no UI wireframes discussed or approved. A Moderator-facing UI (the queue, per-War report lists, the addressed toggle) is a separate future plan against these same endpoints. The broader admin dashboard (ban/block a voter, view every War/voter regardless of ownership, a creation kill switch, soft/hard-delete split, append-only moderation log — `PROGRESS.md` backlog item 5) is explicitly not touched here.
