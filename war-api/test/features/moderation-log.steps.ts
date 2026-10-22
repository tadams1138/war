import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { sql } from 'kysely';
import sharp from 'sharp';
import { expect } from 'vitest';
import { newId } from '../../src/db/uuid.js';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { logAction } from '../../src/moderation/moderationLogRepository.js';
import { deleteWarRow, markWarRemoved } from '../../src/wars/warsRepository.js';
import { makeAdmin, makeDraftWar, makeDraftWarWithContestants, makeModerator, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { as, putKillSwitch, putRole, uploadImage } from '../setup/apiClient.js';
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

  Scenario('An Admin reads the role-change entries newest first', ({ Given, When, Then }) => {
    let adminId: string;
    let targetId: string;
    let response: request.Response;

    Given('an Admin who granted and then revoked the moderator role on a Voter', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      targetId = (await makeVoter(harness.db, 'target')).id;
      await putRole(harness, adminId, targetId, 'moderator', true);
      await putRole(harness, adminId, targetId, 'moderator', false);
    });

    When('the Admin GETs the moderation log', async () => {
      // Act
      response = await getLog(adminId);
    });

    Then('the response lists the revoke before the grant, each naming the Admin, the Voter, and when', () => {
      // Assert
      expect(response.status).toBe(200);
      const entries = response.body.entries as Array<Record<string, unknown>>;
      expect(entries.map((entry) => entry.action)).toEqual(['revoke_role_moderator', 'grant_role_moderator']);
      for (const entry of entries) {
        expect(entry.actor_voter_id).toBe(adminId);
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

    Given('a Moderator, and 5 moderation log entries logged within the same millisecond', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      seededIds = await seedEntriesWithinOneMillisecond(moderatorId, 5);
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

    Given('a Moderator, and 5 moderation log entries logged within the same millisecond', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      seededIds = await seedEntriesWithinOneMillisecond(moderatorId, 5);
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

  Scenario('Entries carry the names of the acting role holder and the targets', ({ Given, And, When, Then }) => {
    let adminId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('an Admin named "admin" who granted the moderator role to a Voter named "target"', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      const targetId = (await makeVoter(harness.db, 'target')).id;
      await putRole(harness, adminId, targetId, 'moderator', true);
    });

    And('a Moderator named "mod" who logged an action on a War titled "Doomed War"', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'mod')).id;
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      const war = await makeDraftWar(harness.db, creatorId, { title: 'Doomed War' });
      await logAction(harness.db, { action: 'warn_war', actorVoterId: moderatorId, targetWarId: war.id });
    });

    When('the Admin GETs the moderation log', async () => {
      // Act
      response = await getLog(adminId);
    });

    Then('the role entry names the Admin as the actor and the Voter as target, with a null War title', () => {
      // Assert
      const entry = entryWithAction(response, 'grant_role_moderator');
      expect(entry.actor_name).toBe('admin');
      expect(entry.target_voter_name).toBe('target');
      expect(entry.target_war_title).toBeNull();
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then('the War entry names the Moderator as the actor and the War by title, with a null Voter name', () => {
      // Assert
      const entry = entryWithAction(response, 'warn_war');
      expect(entry.actor_name).toBe('mod');
      expect(entry.target_war_title).toBe('Doomed War');
      expect(entry.target_voter_name).toBeNull();
    });
  });

  Scenario("A removed War's title is still shown", ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator who removed a War titled "Removed War"', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      const war = await makeDraftWar(harness.db, creatorId, { title: 'Removed War' });
      await markWarRemoved(harness.db, war.id);
      await logAction(harness.db, { action: 'remove_war', actorVoterId: moderatorId, targetWarId: war.id });
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

    Given('a Moderator who logged an action on a War that was later hard-deleted', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      warId = (await makeDraftWar(harness.db, creatorId, { title: 'Gone War' })).id;
      await logAction(harness.db, { action: 'remove_war', actorVoterId: moderatorId, targetWarId: warId });
      await deleteWarRow(harness.db, warId);
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

  Scenario('A live War with no title is not flagged as deleted', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator who logged an action on a live War with no title', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      const war = await makeDraftWar(harness.db, creatorId, { title: null });
      await logAction(harness.db, { action: 'warn_war', actorVoterId: moderatorId, targetWarId: war.id });
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

  Scenario('An entry with no War target is not flagged as deleted', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator who enabled the kill switch', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      await putKillSwitch(harness, moderatorId, { enabled: true });
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then('the entry is not flagged as targeting a deleted War', () => {
      // Assert
      expect(entryWithAction(response, 'enable_war_creation_kill_switch').target_war_deleted).toBe(false);
    });
  });

  Scenario('A Voter who is not a Moderator sees no moderation entries', ({ Given, When, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin who granted the moderator role to a Voter, and a Moderator who removed a War', async () => {
      // Arrange
      ({ adminId } = await seedRoleGrantAndWarRemoval());
    });

    When('the Admin GETs the moderation log', async () => {
      // Act
      response = await getLog(adminId);
    });

    Then('the response lists the role grant and no moderation entry', () => {
      // Assert
      expect(entryActions(response)).toEqual(['grant_role_moderator']);
    });
  });

  Scenario('A Voter who is not an Admin sees no role-change entries', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('an Admin who granted the moderator role to a Voter, and a Moderator who removed a War', async () => {
      // Arrange
      ({ moderatorId } = await seedRoleGrantAndWarRemoval());
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then('the response lists the War removal and no role-change entry', () => {
      // Assert
      expect(entryActions(response)).toEqual(['remove_war']);
    });
  });

  Scenario("An Admin's action on another Voter's War is logged naming the Admin and the War", ({ Given, And, When, Then }) => {
    let adminId: string;
    let warId: string;
    let response: request.Response;

    Given('an Admin and a published War titled "Their War" created by Voter A', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      const voterA = await makeVoter(harness.db, 'voter-a');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, voterA.id, 2, { title: 'Their War' });
      warId = (await publishWarForTest(harness.db, war)).id;
    });

    When('the Admin unpublishes the War', async () => {
      // Act
      expect((await as(harness, adminId).post(`/api/v1/wars/${warId}/unpublish`)).status).toBe(200);
    });

    And('the Admin GETs the moderation log', async () => {
      // Act
      response = await getLog(adminId);
    });

    Then('the entry names the Admin as the actor and the War by title "Their War"', () => {
      // Assert
      const entry = entryWithAction(response, 'unpublish_war');
      expect(entry.actor_voter_id).toBe(adminId);
      expect(entry.actor_name).toBe('admin');
      expect(entry.target_war_id).toBe(warId);
      expect(entry.target_war_title).toBe('Their War');
    });
  });

  Scenario('An Admin acting on their own War writes no moderation log entry', ({ Given, When, Then }) => {
    let adminId: string;
    let warId: string;

    Given('an Admin and a published War created by that Admin', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, adminId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
    });

    When('the Admin unpublishes the War', async () => {
      // Act
      expect((await as(harness, adminId).post(`/api/v1/wars/${warId}/unpublish`)).status).toBe(200);
    });

    Then('no moderation log entry exists', async () => {
      // Assert
      expect(await moderationLog(harness.db)).toHaveLength(0);
    });
  });

  Scenario("Every kind of change an Admin makes to another Voter's War is logged once per request", ({ Given, When, Then }) => {
    let adminId: string;
    let warId: string;
    let contestantId: string;

    Given('an Admin and a draft War created by Voter A with 2 contestants', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      const voterA = await makeVoter(harness.db, 'voter-a');
      const seeded = await makeDraftWarWithContestants(harness.db, harness.storage, voterA.id, 2);
      warId = seeded.war.id;
      contestantId = seeded.contestants[0]!.id;
    });

    When(
      'the Admin edits, shares, adds and edits a contestant, adds, reorders and removes an image, removes a contestant, publishes, unpublishes, clears the votes of and deletes the War',
      async () => {
        // Act
        const admin = as(harness, adminId);
        const photo = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
        const base = `/api/v1/wars/${warId}`;
        const fresh = await admin.post(`${base}/contestants`, { name: 'Extra' });
        const extraId = fresh.body.id as string;
        await admin.patch(`${base}`, { title: 'Edited' });
        await admin.post(`${base}/share-image`, { configure: (req) => req.attach('file', photo, { filename: 's.jpg', contentType: 'image/jpeg' }) });
        await admin.patch(`${base}/contestants/${extraId}`, { name: 'Renamed' });
        await uploadImage(harness, warId, contestantId, adminId, photo);
        const mediaId = (await harness.db.selectFrom('contestant_media').select('id').executeTakeFirstOrThrow()).id;
        await admin.patch(`${base}/contestants/${contestantId}/media/${mediaId}`, { display_order: 0 });
        await admin.delete(`${base}/contestants/${contestantId}/media/${mediaId}`);
        await admin.delete(`${base}/contestants/${extraId}`);
        await admin.post(`${base}/publish`);
        await admin.post(`${base}/unpublish`);
        await admin.post(`${base}/clear-votes`);
        await admin.delete(base);
      },
    );

    Then(
      'the log holds one entry per request, with the action names edit_war, set_share_image, add_contestant, edit_contestant, add_image, reorder_images, remove_image, remove_contestant, publish_war, unpublish_war, clear_votes and delete_war',
      async () => {
        // Assert
        const rows = await moderationLog(harness.db);
        expect(rows.map((r) => r.action).sort()).toEqual(
          [
            'add_contestant', 'edit_war', 'set_share_image', 'edit_contestant', 'add_image', 'reorder_images', 'remove_image',
            'remove_contestant', 'publish_war', 'unpublish_war', 'clear_votes', 'delete_war',
          ].sort(),
        );
        expect(rows.every((r) => r.staff_voter_id === adminId && r.target_war_id === warId)).toBe(true);
      },
    );
  });

  Scenario('A Moderator sees no owner-action entries', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a published War created by Voter A, an Admin who unpublished it and a Moderator who removed another War', async () => {
      // Arrange
      ({ moderatorId } = await seedOwnerActionAndWarRemoval());
    });

    When('the Moderator GETs the moderation log', async () => {
      // Act
      response = await getLog(moderatorId);
    });

    Then('the response lists the War removal and no owner-action entry', () => {
      // Assert
      expect(entryActions(response)).toEqual(['remove_war']);
    });
  });

  Scenario('An Admin sees owner-action entries and no moderation entries', ({ Given, When, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('a published War created by Voter A, an Admin who unpublished it and a Moderator who removed another War', async () => {
      // Arrange
      ({ adminId } = await seedOwnerActionAndWarRemoval());
    });

    When('the Admin GETs the moderation log', async () => {
      // Act
      response = await getLog(adminId);
    });

    Then('the response lists the owner action and no moderation entry', () => {
      // Assert
      expect(entryActions(response)).toEqual(['unpublish_war']);
    });
  });

  Scenario('A refused owner action by an Admin writes no entry', ({ Given, When, Then }) => {
    let adminId: string;
    let warId: string;
    let response: request.Response;

    Given('an Admin and a War created by Voter A', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      warId = (await makeDraftWar(harness.db, (await makeVoter(harness.db, 'voter-a')).id)).id;
    });

    When('the Admin PATCHes the War with an invalid title', async () => {
      // Act
      response = await as(harness, adminId).patch(`/api/v1/wars/${warId}`, { title: '' });
    });

    Then('no moderation log entry exists', async () => {
      // Assert
      expect(response.status).toBe(422);
      expect(await moderationLog(harness.db)).toHaveLength(0);
    });
  });

  async function seedOwnerActionAndWarRemoval(): Promise<{ adminId: string; moderatorId: string }> {
    const adminId = (await makeAdmin(harness.db, 'admin')).id;
    const moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    const voterA = await makeVoter(harness.db, 'voter-a');
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, voterA.id, 2);
    const published = await publishWarForTest(harness.db, war);
    await as(harness, adminId).post(`/api/v1/wars/${published.id}/unpublish`);
    const other = await makeDraftWar(harness.db, voterA.id);
    await logAction(harness.db, { action: 'remove_war', actorVoterId: moderatorId, targetWarId: other.id });
    return { adminId, moderatorId };
  }

  function entryActions(response: request.Response): string[] {
    expect(response.status).toBe(200);
    return (response.body.entries as Array<{ action: string }>).map((entry) => entry.action);
  }

  async function seedRoleGrantAndWarRemoval(): Promise<{ adminId: string; moderatorId: string }> {
    const adminId = (await makeAdmin(harness.db, 'admin')).id;
    const targetId = (await makeVoter(harness.db, 'target')).id;
    await putRole(harness, adminId, targetId, 'moderator', true);
    const moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    const creatorId = (await makeVoter(harness.db, 'creator')).id;
    const war = await makeDraftWar(harness.db, creatorId);
    await logAction(harness.db, { action: 'remove_war', actorVoterId: moderatorId, targetWarId: war.id });
    return { adminId, moderatorId };
  }

  function entryWithAction(response: request.Response, action: string): Record<string, unknown> {
    expect(response.status).toBe(200);
    const entry = (response.body.entries as Array<Record<string, unknown>>).find((e) => e.action === action);
    expect(entry).toBeDefined();
    return entry!;
  }

  /** Inserts `count` entries whose created_at differ only in microseconds; returns their ids newest first. */
  async function seedEntriesWithinOneMillisecond(actorId: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      const id = newId();
      const micros = String(i * 100).padStart(6, '0');
      await sql`insert into moderation_log (id, action, staff_voter_id, created_at)
        values (${id}::uuid, 'enable_war_creation_kill_switch', ${actorId}::uuid, ${`2026-01-01T00:00:00.${micros}Z`}::timestamptz)`.execute(harness.db);
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
