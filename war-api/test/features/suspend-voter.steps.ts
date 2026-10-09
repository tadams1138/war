import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { UNKNOWN_ID, joinWarAsVoter, makeAdmin, makeDraftWar, makeDraftWarWithContestants, makeModerator, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { as, postWar } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/suspend-voter.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  async function putSuspension(callerId: string, targetId: string, suspended: boolean): Promise<request.Response> {
    return as(harness, callerId).put(`/api/v1/voters/${targetId}/suspension`, { suspended });
  }

  async function warCount(): Promise<number> {
    return (await harness.db.selectFrom('wars').selectAll().execute()).length;
  }

  Scenario('A suspended Voter cannot create a War', ({ Given, When, And, Then }) => {
    let moderatorId: string;
    let voterId: string;
    let response: request.Response;

    Given('a Moderator and a plain Voter', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('the Moderator suspends the Voter', async () => {
      // Act
      await putSuspension(moderatorId, voterId, true);
    });

    And('the Voter POSTs a War', async () => {
      // Act
      response = await postWar(harness, voterId);
    });

    Then('the response is 403 suspended and no War exists', async () => {
      // Assert
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'suspended' });
      expect(await warCount()).toBe(0);
    });
  });

  async function logRows() {
    return harness.db.selectFrom('moderation_log').selectAll().execute();
  }

  async function isSuspended(voterId: string): Promise<boolean> {
    const row = await harness.db.selectFrom('voters').select('suspended_at').where('id', '=', voterId).executeTakeFirstOrThrow();
    return row.suspended_at !== null;
  }

  Scenario('Staff cannot suspend themselves', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator suspends themself', async () => {
      // Act
      response = await putSuspension(moderatorId, moderatorId, true);
    });

    Then('the response is 403 and the Moderator is not suspended and nothing is logged', async () => {
      // Assert
      expect(response.status).toBe(403);
      expect(await isSuspended(moderatorId)).toBe(false);
      expect(await logRows()).toHaveLength(0);
    });
  });

  Scenario('Staff cannot suspend other Staff', ({ Given, When, Then }) => {
    let moderatorId: string;
    let adminId: string;
    let response: request.Response;

    Given('a Moderator and an Admin', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      adminId = (await makeAdmin(harness.db, 'admin')).id;
    });

    When('the Moderator suspends the Admin', async () => {
      // Act
      response = await putSuspension(moderatorId, adminId, true);
    });

    Then('the response is 403 and the Admin is not suspended and nothing is logged', async () => {
      // Assert
      expect(response.status).toBe(403);
      expect(await isSuspended(adminId)).toBe(false);
      expect(await logRows()).toHaveLength(0);
    });
  });

  Scenario('Unsuspending restores War creation', ({ Given, When, And, Then }) => {
    let moderatorId: string;
    let voterId: string;
    let response: request.Response;

    Given('a Moderator and a plain Voter', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('the Moderator suspends the Voter', async () => {
      // Act
      await putSuspension(moderatorId, voterId, true);
    });

    And('the Moderator unsuspends the Voter', async () => {
      // Act
      await putSuspension(moderatorId, voterId, false);
    });

    And('the Voter POSTs a War', async () => {
      // Act
      response = await postWar(harness, voterId);
    });

    Then('the response is 201 and one War exists', async () => {
      // Assert
      expect(response.status).toBe(201);
      expect(await warCount()).toBe(1);
    });
  });

  Scenario('Suspending and unsuspending are logged', ({ Given, When, And, Then }) => {
    let moderatorId: string;
    let voterId: string;

    Given('a Moderator and a plain Voter', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('the Moderator suspends the Voter', async () => {
      // Act
      await putSuspension(moderatorId, voterId, true);
    });

    And('the Moderator unsuspends the Voter', async () => {
      // Act
      await putSuspension(moderatorId, voterId, false);
    });

    Then('the log holds a suspend_voter and an unsuspend_voter entry naming the Moderator and the Voter', async () => {
      // Assert
      const rows = await logRows();
      expect(rows.map((row) => row.action).sort()).toEqual(['suspend_voter', 'unsuspend_voter']);
      for (const row of rows) {
        expect(row.staff_voter_id).toBe(moderatorId);
        expect(row.target_voter_id).toBe(voterId);
        expect(row.target_war_id).toBeNull();
      }
    });
  });

  Scenario('A plain Voter cannot suspend', ({ Given, When, Then }) => {
    let callerId: string;
    let targetId: string;
    let response: request.Response;

    Given('two plain Voters', async () => {
      // Arrange
      callerId = (await makeVoter(harness.db, 'caller')).id;
      targetId = (await makeVoter(harness.db, 'target')).id;
    });

    When('the first Voter suspends the second', async () => {
      // Act
      response = await putSuspension(callerId, targetId, true);
    });

    Then('the response is 403 and nothing is logged', async () => {
      // Assert
      expect(response.status).toBe(403);
      expect(await isSuspended(targetId)).toBe(false);
      expect(await logRows()).toHaveLength(0);
    });
  });

  Scenario('Suspending an unknown Voter 404s', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator suspends an unknown Voter id', async () => {
      // Act
      response = await putSuspension(moderatorId, UNKNOWN_ID, true);
    });

    Then('the response is 404 and nothing is logged', async () => {
      // Assert
      expect(response.status).toBe(404);
      expect(await logRows()).toHaveLength(0);
    });
  });

  Scenario('A suspended Voter can still vote and edit their own Wars', ({ Given, When, Then }) => {
    let voterId: string;
    let ownWarId: string;
    let otherWarId: string;
    let voteResponse: request.Response;
    let patchResponse: request.Response;

    Given("a suspended Voter who owns a draft War and has joined another Voter's published War", async () => {
      // Arrange
      const moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
      const creatorId = (await makeVoter(harness.db, 'creator')).id;
      ownWarId = (await makeDraftWar(harness.db, voterId)).id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      otherWarId = (await publishWarForTest(harness.db, war)).id;
      await joinWarAsVoter(harness.db, otherWarId, voterId);
      await putSuspension(moderatorId, voterId, true);
    });

    When('the suspended Voter votes and PATCHes their own War', async () => {
      // Act
      const next = await as(harness, voterId).get(`/api/v1/wars/${otherWarId}/matchups/next`);
      voteResponse = await as(harness, voterId).post(`/api/v1/wars/${otherWarId}/matchups/${next.body.matchup.id}/vote`, {
        winner_id: next.body.matchup.left.id,
      });
      patchResponse = await as(harness, voterId).patch(`/api/v1/wars/${ownWarId}`, { title: 'Renamed' });
    });

    Then('the vote is created and the PATCH succeeds', () => {
      // Assert
      expect(voteResponse.status).toBe(201);
      expect(patchResponse.status).toBe(200);
      expect(patchResponse.body.title).toBe('Renamed');
    });
  });

  Scenario('The kill switch wins over a suspension', ({ Given, When, Then }) => {
    let voterId: string;
    let response: request.Response;

    Given('a Moderator and a suspended Voter and the kill switch on', async () => {
      // Arrange
      const moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
      await putSuspension(moderatorId, voterId, true);
      await as(harness, moderatorId).put('/api/v1/kill-switch', { enabled: true });
    });

    When('the Voter POSTs a War', async () => {
      // Act
      response = await postWar(harness, voterId);
    });

    Then('the response is 503 war_creation_disabled', () => {
      // Assert
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'war_creation_disabled' });
    });
  });
});
