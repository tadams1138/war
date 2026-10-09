import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { UNKNOWN_ID, makeAdmin, makeModerator, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { putRole } from '../setup/apiClient.js';

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

    When('the Admin PUTs granted true for the moderator role on that Voter', async () => {
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

    When('the Admin PUTs granted false for the moderator role on that Voter', async () => {
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

  Scenario('A non-Admin cannot grant any role', ({ Given, When, Then }) => {
    let callerId: string;
    let targetId: string;
    let response: request.Response;

    Given('a plain Voter and another plain Voter', async () => {
      // Arrange
      const caller = await makeVoter(harness.db, 'caller');
      const target = await makeVoter(harness.db, 'target');
      callerId = caller.id;
      targetId = target.id;
    });

    When('the first Voter PUTs granted true for the moderator role on the second', async () => {
      // Act
      response = await putRole(harness, callerId, targetId, 'moderator', true);
    });

    Then('the response status is 403', () => {
      // Assert
      expect(response.status).toBe(403);
    });
  });

  Scenario('A Moderator alone cannot grant any role', ({ Given, When, Then }) => {
    let moderatorId: string;
    let targetId: string;
    let response: request.Response;

    Given('a Moderator and a plain Voter', async () => {
      // Arrange
      const moderator = await makeModerator(harness.db, 'moderator');
      const target = await makeVoter(harness.db, 'target');
      moderatorId = moderator.id;
      targetId = target.id;
    });

    When('the Moderator PUTs granted true for the admin role on the plain Voter', async () => {
      // Act
      response = await putRole(harness, moderatorId, targetId, 'admin', true);
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

    When('the Admin PUTs granted true for the moderator role on a nonexistent voter id', async () => {
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

    When('the Admin PUTs granted false for the admin role on themselves', async () => {
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

    When("the first Admin PUTs granted false for the admin role on the second Admin", async () => {
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
});
