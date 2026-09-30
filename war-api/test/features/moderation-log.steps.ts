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
});
