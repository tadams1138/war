import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeModerator, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { getMe } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/auth-me-roles.feature', import.meta.url)));

describeFeature(feature, ({ ScenarioOutline, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  ScenarioOutline("GET /api/v1/auth/me reports the caller's Staff roles", ({ Given, When, Then, And }, variables) => {
    let voterId: string;
    let response: request.Response;

    Given('a <caller>', async () => {
      // Arrange
      const voter = variables.caller === 'Moderator' ? await makeModerator(harness.db, 'caller') : await makeVoter(harness.db, 'caller');
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

    And('the response reports is_moderator <moderator> and is_admin <admin>', () => {
      // Assert
      expect(response.body.voter.is_moderator).toBe(variables.moderator === 'true');
      expect(response.body.voter.is_admin).toBe(variables.admin === 'true');
    });
  });
});
