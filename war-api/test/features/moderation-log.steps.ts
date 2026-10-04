import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeAdmin, makeModerator } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/moderation-log.feature', import.meta.url)));

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

  Scenario('Granting a role writes a moderation log entry', ({ Given, When, Then }) => {
    let adminId: string;
    let targetId: string;

    Given('an Admin and a plain Voter', async () => {
      const admin = await makeAdmin(harness.db, 'admin');
      const target = await makeVoter(harness.db, 'target');
      adminId = admin.id;
      targetId = target.id;
    });

    When('the Admin PUTs granted true for the moderator role on that Voter', async () => {
      await putRole(adminId, targetId, 'moderator', true);
    });

    Then('a moderation log entry records the Admin granting the moderator role to that Voter', async () => {
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
      const admin = await makeAdmin(harness.db, 'admin');
      const target = await makeModerator(harness.db, 'target');
      adminId = admin.id;
      targetId = target.id;
    });

    When('the Admin PUTs granted false for the moderator role on that Voter', async () => {
      await putRole(adminId, targetId, 'moderator', false);
    });

    Then('a moderation log entry records the Admin revoking the moderator role from that Voter', async () => {
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

    When('the Admin PUTs granted false for the admin role on themselves', async () => {
      // Act
      response = await putRole(adminId, adminId, 'admin', false);
    });

    Then('no moderation log entry exists', async () => {
      // Assert
      expect(response.status).toBe(403);
      const rows = await harness.db.selectFrom('moderation_log').selectAll().execute();
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
      await putRole(adminId, targetId, 'moderator', true);
      await putRole(adminId, targetId, 'moderator', false);
    });

    And('a Moderator', async () => {
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

  async function getLog(callerId: string): Promise<request.Response> {
    await harness.app.ready();
    const jwt = await harness.jwtFor(callerId);
    return request(harness.app.server).get('/api/v1/moderation-log').set('Authorization', `Bearer ${jwt}`);
  }
});
