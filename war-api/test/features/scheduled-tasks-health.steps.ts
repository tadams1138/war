import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { anonymous, withInternalToken } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/scheduled-tasks-health.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('No successful run has been recorded', ({ Given, When, Then, And }) => {
    let response: request.Response;

    Given('the close-expired-wars task has never succeeded', () => {
      // Arrange
      // truncateAll left no platform_settings row.
    });

    When('anyone GETs /api/v1/health/scheduled-tasks', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get('/api/v1/health/scheduled-tasks');
    });

    Then('the response status is 503', () => {
      // Assert
      expect(response.status).toBe(503);
    });

    And('the response is not cacheable', () => {
      // Assert
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  Scenario('A successful close run is reported', ({ Given, When, Then, And }) => {
    let response: request.Response;

    Given('the close-expired-wars task has just succeeded', async () => {
      // Arrange
      await harness.app.ready();
      await withInternalToken(harness).post('/api/v1/internal/close-expired-wars');
    });

    When('anyone GETs /api/v1/health/scheduled-tasks', async () => {
      // Act
      response = await anonymous(harness).get('/api/v1/health/scheduled-tasks');
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });

    And('the response is not cacheable', () => {
      // Assert
      expect(response.headers['cache-control']).toBe('no-store');
    });

    And('the response reports only the time of the last success', () => {
      // Assert
      expect(Object.keys(response.body as object).sort()).toEqual(['last_success_at', 'status']);
      expect(Date.now() - Date.parse((response.body as { last_success_at: string }).last_success_at)).toBeLessThan(60_000);
    });
  });

  /** Runs the task as if `hours` ago, then returns the clock to the present. */
  async function runTaskHoursAgo(hours: number): Promise<Date> {
    const present = new Date();
    const then = new Date(present.getTime() - hours * 60 * 60 * 1000);
    harness.setNow(then);
    await harness.app.ready();
    await withInternalToken(harness).post('/api/v1/internal/close-expired-wars');
    harness.setNow(present);
    return then;
  }

  Scenario('The last success is still fresh after two missed nightly runs', ({ Given, When, Then }) => {
    let response: request.Response;

    Given('the close-expired-wars task last succeeded 48 hours ago', async () => {
      // Arrange
      await runTaskHoursAgo(48);
    });

    When('anyone GETs /api/v1/health/scheduled-tasks', async () => {
      // Act
      response = await anonymous(harness).get('/api/v1/health/scheduled-tasks');
    });

    Then('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });
  });

  Scenario('The last success is too old', ({ Given, When, Then, And }) => {
    let response: request.Response;
    let succeededAt: Date;

    Given('the close-expired-wars task last succeeded 50 hours ago', async () => {
      // Arrange
      succeededAt = await runTaskHoursAgo(50);
    });

    When('anyone GETs /api/v1/health/scheduled-tasks', async () => {
      // Act
      response = await anonymous(harness).get('/api/v1/health/scheduled-tasks');
    });

    Then('the response status is 503', () => {
      // Assert
      expect(response.status).toBe(503);
    });

    And('the response reports the time of that last success', () => {
      // Assert
      expect((response.body as { last_success_at: string }).last_success_at).toBe(succeededAt.toISOString());
    });
  });

  Scenario('A rejected run does not count as a success', ({ Given, When, Then }) => {
    let response: request.Response;

    Given('the close-expired-wars task was called with a wrong X-Internal-Token', async () => {
      // Arrange
      await harness.app.ready();
      await withInternalToken(harness, 'wrong-token').post('/api/v1/internal/close-expired-wars');
    });

    When('anyone GETs /api/v1/health/scheduled-tasks', async () => {
      // Act
      response = await anonymous(harness).get('/api/v1/health/scheduled-tasks');
    });

    Then('the response status is 503', () => {
      // Assert
      expect(response.status).toBe(503);
    });
  });
});
