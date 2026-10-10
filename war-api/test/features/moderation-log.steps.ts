import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { sql } from 'kysely';
import { expect } from 'vitest';
import { newId } from '../../src/db/uuid.js';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { logAction } from '../../src/moderation/moderationLogRepository.js';
import { deleteWarRow, markWarRemoved } from '../../src/wars/warsRepository.js';
import { makeAdmin, makeDraftWar, makeModerator, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { putRole } from '../setup/apiClient.js';
import { moderationLog } from '../setup/queries.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/moderation-log.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('Granting a role writes a moderation log entry', ({ Given, When, Then }) => {
    let adminId: string;
    let targetId: string;

    Given('an Admin and a plain Voter', async () => {
      // Arrange
      const admin = await makeAdmin(harness.db, 'admin');
      const target = await makeVoter(harness.db, 'target');
      adminId = admin.id;
      targetId = target.id;
    });

    When('the Admin grants the moderator role to that Voter', async () => {
      // Act
      await putRole(harness, adminId, targetId, 'moderator', true);
    });

    Then('a moderation log entry records the Admin granting the moderator role to that Voter', async () => {
      // Assert
      const rows = await harness.db.selectFrom('moderation_log').selectAll().where('target_voter_id', '=', targetId).execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('grant_role_moderator');
      expect(rows[0]?.staff_voter_id).toBe(adminId);
    });
  });

  Scenario('Revoking a role writes a moderation log entry', ({ Given, When, Then }) => {
    let adminId: string;
    let targetId: string;

    Given('an Admin and a Voter who already has the moderator role', async () => {
      // Arrange
      const admin = await makeAdmin(harness.db, 'admin');
      const target = await makeModerator(harness.db, 'target');
      adminId = admin.id;
      targetId = target.id;
    });

    When('the Admin revokes the moderator role from that Voter', async () => {
      // Act
      await putRole(harness, adminId, targetId, 'moderator', false);
    });

    Then('a moderation log entry records the Admin revoking the moderator role from that Voter', async () => {
      // Assert
      const rows = await harness.db.selectFrom('moderation_log').selectAll().where('target_voter_id', '=', targetId).execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('revoke_role_moderator');
      expect(rows[0]?.staff_voter_id).toBe(adminId);
    });
  });

  Scenario('A refused self-removal writes no moderation log entry', ({ Given, When, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
    });

    When('the Admin revokes the admin role from themselves', async () => {
      // Act
      response = await putRole(harness, adminId, adminId, 'admin', false);
    });

    Then('no moderation log entry exists', async () => {
      // Assert
      expect(response.status).toBe(403);
      const rows = await moderationLog(harness.db);
      expect(rows).toHaveLength(0);
    });
  });

  Scenario('Staff read the moderation log newest first', ({ Given, And, When, Then }) => {
    let adminId: string;
    let targetId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('an Admin who granted and then revoked the moderator role on a Voter', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      targetId = (await makeVoter(harness.db, 'target')).id;
      await putRole(harness, adminId, targetId, 'moderator', true);
      await putRole(harness, adminId, targetId, 'moderator', false);
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then('the response lists the revoke before the grant, each naming the Admin, the Voter, and when', () => {
      // Assert
      expect(response.status).toBe(200);
      const entries = response.body.entries as Array<Record<string, unknown>>;
      expect(entries.map((entry) => entry.action)).toEqual(['revoke_role_moderator', 'grant_role_moderator']);
      for (const entry of entries) {
        expect(entry.staff_voter_id).toBe(adminId);
        expect(entry.target_voter_id).toBe(targetId);
        expect(entry.target_war_id).toBeNull();
        expect(Number.isNaN(Date.parse(entry.created_at as string))).toBe(false);
      }
    });
  });

  Scenario('A plain Voter cannot read the moderation log', ({ Given, When, Then }) => {
    let voterId: string;
    let response: request.Response;

    Given('a plain Voter', async () => {
      // Arrange
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('that Voter GETs the moderation log', async () => {
      // Act
      response = await getLog(voterId);
    });

    Then('the response is 403', () => {
      // Assert
      expect(response.status).toBe(403);
    });
  });

  Scenario('The moderation log is returned a page at a time', ({ Given, When, Then }) => {
    let moderatorId: string;
    let seededIds: string[];
    let response: request.Response;

    Given('an Admin and a Moderator, and 5 moderation log entries logged within the same millisecond', async () => {
      // Arrange
      const adminId = (await makeAdmin(harness.db, 'admin')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      seededIds = await seedEntriesWithinOneMillisecond(adminId, 5);
    });

    When('the Moderator GETs the moderation log with limit 2', async () => {
      // Act
      response = await getLog(moderatorId, { limit: '2' });
    });

    Then('the response has the 2 newest entries and a next cursor', () => {
      // Assert
      expect(response.status).toBe(200);
      const entries = response.body.entries as Array<{ id: string }>;
      expect(entries.map((entry) => entry.id)).toEqual(seededIds.slice(0, 2));
      expect(typeof response.body.next_cursor).toBe('string');
    });
  });

  Scenario('Following the next cursor returns every remaining entry exactly once', ({ Given, When, Then }) => {
    let moderatorId: string;
    let seededIds: string[];
    let pages: request.Response[];

    Given('an Admin and a Moderator, and 5 moderation log entries logged within the same millisecond', async () => {
      // Arrange
      const adminId = (await makeAdmin(harness.db, 'admin')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      seededIds = await seedEntriesWithinOneMillisecond(adminId, 5);
    });

    When('the Moderator pages through the moderation log with limit 2 following each next cursor', async () => {
      // Act
      pages = [];
      let cursor: string | undefined;
      do {
        const page = await getLog(moderatorId, cursor ? { limit: '2', cursor } : { limit: '2' });
        pages.push(page);
        cursor = (page.body.next_cursor as string | null) ?? undefined;
      } while (cursor && pages.length < 10);
    });

    Then('every entry appears exactly once, newest first, and the last page has a null next cursor', () => {
      // Assert
      expect(pages.map((page) => page.status)).toEqual([200, 200, 200]);
      const ids = pages.flatMap((page) => (page.body.entries as Array<{ id: string }>).map((entry) => entry.id));
      expect(ids).toEqual(seededIds);
      expect(pages[pages.length - 1]?.body.next_cursor).toBeNull();
    });
  });

  Scenario('A malformed cursor is rejected', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the moderation log with cursor "not-a-cursor"', async () => {
      // Act
      response = await getLog(moderatorId, { cursor: 'not-a-cursor' });
    });

    Then('the response is 400', () => {
      // Assert
      expect(response.status).toBe(400);
    });
  });

  Scenario('A limit outside 1 to 100 is rejected', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the moderation log with limit 101', async () => {
      // Act
      response = await getLog(moderatorId, { limit: '101' });
    });

    Then('the response is 400', () => {
      // Assert
      expect(response.status).toBe(400);
    });
  });

  Scenario('Entries carry the names of the acting Staff member and the targets', ({ Given, And, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given(
      'an Admin named "admin" who granted the moderator role to a Voter named "target" and logged an action on a War titled "Doomed War"',
      async () => {
        // Arrange
        const adminId = (await makeAdmin(harness.db, 'admin')).id;
        const targetId = (await makeVoter(harness.db, 'target')).id;
        const creatorId = (await makeVoter(harness.db, 'creator')).id;
        const war = await makeDraftWar(harness.db, creatorId, { title: 'Doomed War' });
        await putRole(harness, adminId, targetId, 'moderator', true);
        await logAction(harness.db, { action: 'warn_war', staffVoterId: adminId, targetWarId: war.id });
      },
    );

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then('the role entry names the Admin as staff and the Voter as target, with a null War title', () => {
      // Assert
      const entry = entryWithAction(response, 'grant_role_moderator');
      expect(entry.staff_name).toBe('admin');
      expect(entry.target_voter_name).toBe('target');
      expect(entry.target_war_title).toBeNull();
    });

    And('the War entry names the Admin as staff and the War by title, with a null Voter name', () => {
      // Assert
      const entry = entryWithAction(response, 'warn_war');
      expect(entry.staff_name).toBe('admin');
      expect(entry.target_war_title).toBe('Doomed War');
      expect(entry.target_voter_name).toBeNull();
    });
  });

  Scenario("A removed War's title is still shown", ({ Given, And, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('an Admin who removed a War titled "Removed War"', async () => {
      // Arrange
      const adminId = (await makeAdmin(harness.db, 'admin')).id;
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      const war = await makeDraftWar(harness.db, creatorId, { title: 'Removed War' });
      await markWarRemoved(harness.db, war.id);
      await logAction(harness.db, { action: 'remove_war', staffVoterId: adminId, targetWarId: war.id });
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then('the entry carries the War title "Removed War"', () => {
      // Assert
      expect(entryWithAction(response, 'remove_war').target_war_title).toBe('Removed War');
    });
  });

  Scenario('A hard-deleted War leaves a flagged entry with a null title', ({ Given, And, When, Then }) => {
    let moderatorId: string;
    let warId: string;
    let response: request.Response;

    Given('an Admin who logged an action on a War that was later hard-deleted', async () => {
      // Arrange
      const adminId = (await makeAdmin(harness.db, 'admin')).id;
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      warId = (await makeDraftWar(harness.db, creatorId, { title: 'Gone War' })).id;
      await logAction(harness.db, { action: 'remove_war', staffVoterId: adminId, targetWarId: warId });
      await deleteWarRow(harness.db, warId);
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then("the entry remains, still naming the deleted War's id, with a null War title", () => {
      // Assert
      const entry = entryWithAction(response, 'remove_war');
      expect(entry.target_war_id).toBe(warId);
      expect(entry.target_war_title).toBeNull();
    });

    And('the entry is flagged as targeting a deleted War', () => {
      // Assert
      expect(entryWithAction(response, 'remove_war').target_war_deleted).toBe(true);
    });
  });

  Scenario('A live War with no title is not flagged as deleted', ({ Given, And, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('an Admin who logged an action on a live War with no title', async () => {
      // Arrange
      const adminId = (await makeAdmin(harness.db, 'admin')).id;
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      const war = await makeDraftWar(harness.db, creatorId, { title: null });
      await logAction(harness.db, { action: 'warn_war', staffVoterId: adminId, targetWarId: war.id });
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then('the entry has a null War title and is not flagged as targeting a deleted War', () => {
      // Assert
      const entry = entryWithAction(response, 'warn_war');
      expect(entry.target_war_title).toBeNull();
      expect(entry.target_war_deleted).toBe(false);
    });
  });

  Scenario('An entry with no War target is not flagged as deleted', ({ Given, And, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('an Admin who granted the moderator role to a Voter', async () => {
      // Arrange
      const adminId = (await makeAdmin(harness.db, 'admin')).id;
      const targetId = (await makeVoter(harness.db, 'target')).id;
      await putRole(harness, adminId, targetId, 'moderator', true);
    });

    And('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then('the entry is not flagged as targeting a deleted War', () => {
      // Assert
      expect(entryWithAction(response, 'grant_role_moderator').target_war_deleted).toBe(false);
    });
  });

  function entryWithAction(response: request.Response, action: string): Record<string, unknown> {
    expect(response.status).toBe(200);
    const entry = (response.body.entries as Array<Record<string, unknown>>).find((e) => e.action === action);
    expect(entry).toBeDefined();
    return entry!;
  }

  /** Inserts `count` entries whose created_at differ only in microseconds; returns their ids newest first. */
  async function seedEntriesWithinOneMillisecond(staffId: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      const id = newId();
      const micros = String(i * 100).padStart(6, '0');
      await sql`insert into moderation_log (id, action, staff_voter_id, created_at)
        values (${id}::uuid, 'grant_role_moderator', ${staffId}::uuid, ${`2026-01-01T00:00:00.${micros}Z`}::timestamptz)`.execute(harness.db);
      ids.push(id);
    }
    return ids.reverse();
  }

  async function getLog(callerId: string, query: Record<string, string> = {}): Promise<request.Response> {
    await harness.app.ready();
    const jwt = await harness.jwtFor(callerId);
    return request(harness.app.server).get('/api/v1/moderation-log').query(query).set('Authorization', `Bearer ${jwt}`);
  }
});
