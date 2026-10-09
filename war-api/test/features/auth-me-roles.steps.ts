import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeModerator, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { getMe } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/auth-me-roles.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario("A Moderator's /auth/me reports is_moderator true", ({ Given, When, Then, And }) => {
    let voterId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      const moderator = await makeModerator(harness.db, 'moderator');
      voterId = moderator.id;
    });

    When('they call GET /api/v1/auth/me', async () => {
      // Act
      response = await getMe(harness, voterId);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the response reports is_moderator true and is_admin false', () => {
      // Assert
      expect(response.body.voter.is_moderator).toBe(true);
      expect(response.body.voter.is_admin).toBe(false);
    });
  });

  Scenario("A plain Voter's /auth/me reports both roles false", ({ Given, When, Then, And }) => {
    let voterId: string;
    let response: request.Response;

    Given('a plain Voter', async () => {
      // Arrange
      const voter = await makeVoter(harness.db, 'voter');
      voterId = voter.id;
    });

    When('they call GET /api/v1/auth/me', async () => {
      // Act
      response = await getMe(harness, voterId);
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the response reports is_moderator false and is_admin false', () => {
      // Assert
      expect(response.body.voter.is_moderator).toBe(false);
      expect(response.body.voter.is_admin).toBe(false);
    });
  });
});
