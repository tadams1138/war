import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { loginAndCallback } from '../setup/authFlow.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/oauth-authentication.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('Same email, different provider creates separate voters', ({ Given, When, Then, And }) => {
    Given('voter A signed in with Google using "user@example.com"', async () => {
      await loginAndCallback(harness, { providerUserId: 'user@example.com', displayName: 'User', avatarUrl: null });
    });

    When('a user signs in with Microsoft using "user@example.com"', async () => {
      await loginAndCallback(
        harness,
        { providerUserId: 'user@example.com', displayName: 'User', avatarUrl: null },
        { provider: 'microsoft', fake: harness.microsoft },
      );
    });

    Then('a separate Voter record is created', async () => {
      const row = await harness.db.selectFrom('voters').select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow();
      expect(Number(row.count)).toBe(2);
    });

    And('the two accounts are not linked', async () => {
      const rows = await harness.db.selectFrom('voters').selectAll().execute();
      const providers = rows.map((row) => row.provider).sort();
      expect(providers).toEqual(['google', 'microsoft']);
    });
  });
});
