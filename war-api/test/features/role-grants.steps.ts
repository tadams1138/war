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
