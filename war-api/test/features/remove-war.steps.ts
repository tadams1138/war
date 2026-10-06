import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect, vi } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeModerator, makeDraftWarWithContestants, publishWarForTest } from '../setup/fixtures.js';
import { setWarShareImageKey } from '../../src/wars/warsRepository.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/remove-war.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  async function send(callerId: string, method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: Record<string, unknown>): Promise<request.Response> {
    await harness.app.ready();
    const jwt = await harness.jwtFor(callerId);
    const req = request(harness.app.server)[method](path).set('Authorization', `Bearer ${jwt}`);
    return body ? req.send(body) : req;
  }

  Scenario('A Moderator removes a published War and it becomes not found for everyone', ({ Given, When, Then }) => {
    let creatorId: string;
    let voterId: string;
    let moderatorId: string;
    let warId: string;
    let response: request.Response;

    Given('a published War, its creator, a plain Voter and a Moderator', async () => {
      // Arrange
      creatorId = (await makeVoter(harness.db, 'creator')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
    });

    When('the Moderator removes the War', async () => {
      // Act
      response = await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`);
    });

    Then('the response is 204 and the War is 404 for its creator, the plain Voter and the Moderator', async () => {
      // Assert
      expect(response.status).toBe(204);
      for (const viewer of [creatorId, voterId, moderatorId]) {
        expect((await send(viewer, 'get', `/api/v1/wars/${warId}`)).status).toBe(404);
      }
    });
  });

  Scenario('The creator cannot delete, edit or publish a removed War and its rows persist', ({ Given, When, Then }) => {
    let creatorId: string;
    let warId: string;
    let responses: request.Response[];

    Given('a removed published War with votes', async () => {
      // Arrange
      creatorId = (await makeVoter(harness.db, 'creator')).id;
      const moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
      const matchup = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', warId).executeTakeFirstOrThrow();
      await harness.db
        .insertInto('votes')
        .values({
          id: randomUUID(),
          matchup_id: matchup.id,
          voter_id: creatorId,
          winner_id: contestants[0]!.id,
          presented_left_id: contestants[0]!.id,
        })
        .execute();
      await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`);
    });

    When('the creator DELETEs, PATCHes and publishes the War', async () => {
      // Act
      responses = [
        await send(creatorId, 'delete', `/api/v1/wars/${warId}`),
        await send(creatorId, 'patch', `/api/v1/wars/${warId}`, { title: 'Edited' }),
        await send(creatorId, 'post', `/api/v1/wars/${warId}/publish`),
      ];
    });

    Then('all three responses are 404 and the War, its contestants, matchups and votes still exist', async () => {
      // Assert
      expect(responses.map((r) => r.status)).toEqual([404, 404, 404]);
      const count = async (table: 'wars' | 'contestants' | 'matchups' | 'votes') =>
        (await harness.db.selectFrom(table).selectAll().execute()).length;
      expect(await count('wars')).toBe(1);
      expect(await count('contestants')).toBe(2);
      expect(await count('matchups')).toBe(1);
      expect(await count('votes')).toBe(1);
    });
  });

  Scenario('A plain Voter, including the War\'s creator, cannot remove a War', ({ Given, When, Then }) => {
    let creatorId: string;
    let voterId: string;
    let warId: string;
    let responses: request.Response[];

    Given('a published War, its creator and a plain Voter', async () => {
      // Arrange
      creatorId = (await makeVoter(harness.db, 'creator')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
    });

    When('the creator and the plain Voter each try to remove the War', async () => {
      // Act
      responses = [
        await send(creatorId, 'post', `/api/v1/wars/${warId}/remove`),
        await send(voterId, 'post', `/api/v1/wars/${warId}/remove`),
      ];
    });

    Then('both responses are 403, the War is still visible and no moderation log entry exists', async () => {
      // Assert
      expect(responses.map((r) => r.status)).toEqual([403, 403]);
      expect((await send(voterId, 'get', `/api/v1/wars/${warId}`)).status).toBe(200);
      expect(await harness.db.selectFrom('moderation_log').selectAll().execute()).toHaveLength(0);
    });
  });

  Scenario('Removing a War writes a remove_war moderation log entry', ({ Given, When, Then }) => {
    let moderatorId: string;
    let warId: string;

    Given('a published War and a Moderator', async () => {
      // Arrange
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
    });

    When('the Moderator removes the War', async () => {
      // Act
      await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`);
    });

    Then('a moderation log entry records the Moderator removing the War', async () => {
      // Assert
      const rows = await harness.db.selectFrom('moderation_log').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('remove_war');
      expect(rows[0]?.staff_voter_id).toBe(moderatorId);
      expect(rows[0]?.target_war_id).toBe(warId);
      expect(rows[0]?.target_voter_id).toBeNull();
    });
  });

  Scenario('Removing a nonexistent or already removed War is 404 and logs nothing further', ({ Given, When, Then }) => {
    let moderatorId: string;
    let warId: string;
    let responses: request.Response[];

    Given('a published War and a Moderator', async () => {
      // Arrange
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
    });

    When('the Moderator removes the War twice and removes a War that never existed', async () => {
      // Act
      responses = [
        await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`),
        await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`),
        await send(moderatorId, 'post', `/api/v1/wars/${randomUUID()}/remove`),
      ];
    });

    Then('the first response is 204, the other two are 404 and exactly one moderation log entry exists', async () => {
      // Assert
      expect(responses.map((r) => r.status)).toEqual([204, 404, 404]);
      expect(await harness.db.selectFrom('moderation_log').selectAll().execute()).toHaveLength(1);
    });
  });

  Scenario("A removed War's reports are excluded from the unaddressed queue", ({ Given, When, Then }) => {
    let moderatorId: string;
    let warId: string;

    Given('a published War with an unaddressed report and a Moderator', async () => {
      // Arrange
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      const reporterId = (await makeVoter(harness.db, 'reporter')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
      const report = await send(reporterId, 'post', `/api/v1/wars/${warId}/reports`, { explanation: 'abusive' });
      expect(report.status).toBe(201);
      expect((await send(moderatorId, 'get', '/api/v1/reports/unaddressed')).body.wars).toHaveLength(1);
    });

    When('the Moderator removes the War', async () => {
      // Act
      await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`);
    });

    Then('the unaddressed reports queue is empty', async () => {
      // Assert
      const queue = await send(moderatorId, 'get', '/api/v1/reports/unaddressed');
      expect(queue.body.wars).toEqual([]);
    });
  });

  Scenario('Voting on a matchup of a removed War is rejected', ({ Given, When, Then }) => {
    let moderatorId: string;
    let voterId: string;
    let warId: string;
    let matchupId: string;
    let winnerId: string;
    let response: request.Response;

    Given('a published War with a matchup and a Moderator', async () => {
      // Arrange
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
      winnerId = contestants[0]!.id;
      matchupId = (await harness.db.selectFrom('matchups').select('id').where('war_id', '=', warId).executeTakeFirstOrThrow()).id;
    });

    When('the Moderator removes the War and a Voter votes on its matchup', async () => {
      // Act
      await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`);
      response = await send(voterId, 'post', `/api/v1/wars/${warId}/matchups/${matchupId}/vote`, { winner_id: winnerId });
    });

    Then('the vote response is 404 and no vote exists', async () => {
      // Assert
      expect(response.status).toBe(404);
      expect(await harness.db.selectFrom('votes').selectAll().execute()).toHaveLength(0);
    });
  });

  Scenario("Removing a War hard-deletes its media but leaves another War's media untouched", ({ Given, When, Then }) => {
    let moderatorId: string;
    let warId: string;
    let otherContestantIds: string[];
    let otherKeysBefore: string[];

    const allKeys = () => [...harness.storage.publicObjects.keys(), ...harness.storage.privateObjects.keys()];

    Given('a removed-to-be War with contestant images and a share image, another War with images, and a Moderator', async () => {
      // Arrange
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const first = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      const other = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = first.war.id;
      otherContestantIds = other.contestants.map((c) => c.id);
      await harness.storage.putPublic(`share-images/${warId}.jpg`, Buffer.from('s'));
      await harness.storage.putPrivate(`originals/share-images/${warId}.png`, Buffer.from('o'));
      await harness.storage.putPublic(`share-images/${other.war.id}.jpg`, Buffer.from('s'));
      await setWarShareImageKey(harness.db, warId, `share-images/${warId}.jpg`);
      otherKeysBefore = allKeys().filter((key) => key.includes(other.war.id) || otherContestantIds.some((id) => key.includes(id)));
      expect(otherKeysBefore.length).toBeGreaterThan(0);
    });

    When('the Moderator removes the first War', async () => {
      // Act
      await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`);
    });

    Then("its stored objects and contestant_media rows are gone, its share image key is cleared, and the other War's media remains", async () => {
      // Assert
      expect(allKeys().sort()).toEqual([...otherKeysBefore].sort());
      const media = await harness.db.selectFrom('contestant_media').select('contestant_id').execute();
      expect(new Set(media.map((m) => m.contestant_id))).toEqual(new Set(otherContestantIds));
      const row = await harness.db.selectFrom('wars').select('share_image_key').where('id', '=', warId).executeTakeFirstOrThrow();
      expect(row.share_image_key).toBeNull();
    });
  });

  Scenario('A storage failure while deleting media still removes the War', ({ Given, When, Then }) => {
    let moderatorId: string;
    let warId: string;
    let response: request.Response;

    Given('a published War, a Moderator and storage that fails to delete', async () => {
      // Arrange
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
      vi.spyOn(harness.storage, 'deletePrefix').mockRejectedValue(new Error('storage unavailable'));
    });

    When('the Moderator removes the War', async () => {
      // Act
      response = await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`);
    });

    Then('the response is 204 and the War stays removed', async () => {
      // Assert
      expect(response.status).toBe(204);
      const row = await harness.db.selectFrom('wars').select('removed_at').where('id', '=', warId).executeTakeFirstOrThrow();
      expect(row.removed_at).not.toBeNull();
      expect((await send(moderatorId, 'get', `/api/v1/wars/${warId}`)).status).toBe(404);
    });
  });

  Scenario("A removed War is absent from the public list and from its creator's own list", ({ Given, When, Then }) => {
    let creatorId: string;
    let moderatorId: string;
    let warId: string;

    Given('a published War and a Moderator', async () => {
      // Arrange
      creatorId = (await makeVoter(harness.db, 'creator')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
    });

    When('the Moderator removes the War', async () => {
      // Act
      await send(moderatorId, 'post', `/api/v1/wars/${warId}/remove`);
    });

    Then("the War is absent from GET /wars and from its creator's own list", async () => {
      // Assert
      const publicList = await send(moderatorId, 'get', '/api/v1/wars');
      const ownList = await send(creatorId, 'get', '/api/v1/wars?creator=me');
      expect(publicList.body.wars).toEqual([]);
      expect(ownList.body.wars).toEqual([]);
    });
  });
});
