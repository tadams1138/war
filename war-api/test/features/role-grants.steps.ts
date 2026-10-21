import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { UNKNOWN_ID, makeAdmin, makeModerator, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { as, putRole } from '../setup/apiClient.js';
import { setVoterRole } from '../../src/auth/votersRepository.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/role-grants.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('An Admin grants Moderator to a Voter', ({ Given, When, Then, And }) => {
    let adminId: string;
    let targetId: string;
    let response: request.Response;

    Given('an Admin and a plain Voter', async () => {
      // Arrange
      const admin = await makeAdmin(harness.db, 'admin');
      const target = await makeVoter(harness.db, 'target');
      adminId = admin.id;
      targetId = target.id;
    });

    When('the Admin grants the moderator role to that Voter', async () => {
      // Act
      response = await putRole(harness, adminId, targetId, 'moderator', true);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the Voter now has the moderator role', () => {
      // Assert
      expect(response.body.is_moderator).toBe(true);
    });
  });

  Scenario('An Admin revokes Moderator from a Voter', ({ Given, When, Then, And }) => {
    let adminId: string;
    let targetId: string;
    let response: request.Response;

    Given('an Admin and a Voter who already has the moderator role', async () => {
      // Arrange
      const admin = await makeAdmin(harness.db, 'admin');
      const target = await makeModerator(harness.db, 'target');
      adminId = admin.id;
      targetId = target.id;
    });

    When('the Admin revokes the moderator role from that Voter', async () => {
      // Act
      response = await putRole(harness, adminId, targetId, 'moderator', false);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the Voter no longer has the moderator role', () => {
      // Assert
      expect(response.body.is_moderator).toBe(false);
    });
  });

  Scenario('A Voter who is not an Admin cannot grant a role', ({ Given, When, Then }) => {
    let callerId: string;
    let targetId: string;
    let response: request.Response;

    Given('a plain Voter and a target Voter', async () => {
      // Arrange
      const caller = await makeVoter(harness.db, 'caller');
      const target = await makeVoter(harness.db, 'target');
      callerId = caller.id;
      targetId = target.id;
    });

    When('the plain Voter grants the moderator role to the target Voter', async () => {
      // Act
      response = await putRole(harness, callerId, targetId, 'moderator', true);
    });

    Then('the response status is 403', () => {
      // Assert
      expect(response.status).toBe(403);
    });
  });

  Scenario('Granting a role on a nonexistent voter 404s', ({ Given, When, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin', async () => {
      // Arrange
      const admin = await makeAdmin(harness.db, 'admin');
      adminId = admin.id;
    });

    When('the Admin grants the moderator role to a nonexistent Voter', async () => {
      // Act
      response = await putRole(harness, adminId, UNKNOWN_ID, 'moderator', true);
    });

    Then('the response status is 404', () => {
      // Assert
      expect(response.status).toBe(404);
    });
  });

  Scenario('An Admin cannot remove their own Admin role', ({ Given, When, Then, And }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin', async () => {
      // Arrange
      const admin = await makeAdmin(harness.db, 'admin');
      adminId = admin.id;
    });

    When('the Admin revokes the admin role from themselves', async () => {
      // Act
      response = await putRole(harness, adminId, adminId, 'admin', false);
    });

    Then('the response status is 403', () => {
      // Assert
      expect(response.status).toBe(403);
    });

    And('the Admin still has the admin role', async () => {
      // Assert
      const voter = await harness.db.selectFrom('voters').selectAll().where('id', '=', adminId).executeTakeFirstOrThrow();
      expect(voter.is_admin).toBe(true);
    });
  });

  Scenario("Another Admin can remove a first Admin's role", ({ Given, When, Then, And }) => {
    let firstAdminId: string;
    let secondAdminId: string;
    let response: request.Response;

    Given('two Admins', async () => {
      // Arrange
      const first = await makeAdmin(harness.db, 'first-admin');
      const second = await makeAdmin(harness.db, 'second-admin');
      firstAdminId = first.id;
      secondAdminId = second.id;
    });

    When("the first Admin revokes the admin role from the second Admin", async () => {
      // Act
      response = await putRole(harness, firstAdminId, secondAdminId, 'admin', false);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the second Admin no longer has the admin role', () => {
      // Assert
      expect(response.body.is_admin).toBe(false);
    });
  });

  Scenario('An Admin grants themselves Moderator, keeps Admin and can then use a Moderator feature', ({ Given, When, Then, And }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin', async () => {
      // Arrange
      const admin = await makeAdmin(harness.db, 'admin');
      adminId = admin.id;
    });

    When('the Admin grants the moderator role to themselves', async () => {
      // Act
      response = await putRole(harness, adminId, adminId, 'moderator', true);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the Admin has both the admin and moderator roles', () => {
      // Assert
      expect(response.body.is_admin).toBe(true);
      expect(response.body.is_moderator).toBe(true);
    });

    And('the Admin can GET the unaddressed-reports queue', async () => {
      // Assert
      const queue = await as(harness, adminId).get('/api/v1/reports/unaddressed');
      expect(queue.status).toBe(200);
    });
  });

  Scenario('An Admin revokes their own Moderator role', ({ Given, When, Then, And }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin who also has the moderator role', async () => {
      // Arrange
      const admin = await makeAdmin(harness.db, 'admin');
      await setVoterRole(harness.db, admin.id, 'moderator', true);
      adminId = admin.id;
    });

    When('the Admin revokes the moderator role from themselves', async () => {
      // Act
      response = await putRole(harness, adminId, adminId, 'moderator', false);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the Admin no longer has the moderator role but still has the admin role', () => {
      // Assert
      expect(response.body.is_moderator).toBe(false);
      expect(response.body.is_admin).toBe(true);
    });
  });
});
