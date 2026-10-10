import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeAdmin, makeModerator, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { getKillSwitch, postWar, putKillSwitch } from '../setup/apiClient.js';
import { countWars, moderationLog } from '../setup/queries.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/kill-switch.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('The kill switch defaults to off', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator GETs the kill switch', async () => {
      // Act
      response = await getKillSwitch(harness, moderatorId);
    });

    Then('the response is 200 and the kill switch is off', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ enabled: false });
    });
  });

  Scenario('A plain Voter cannot create a War while the kill switch is on', ({ Given, When, And, Then }) => {
    let adminId: string;
    let voterId: string;
    let response: request.Response;

    Given('an Admin and a plain Voter', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('the Admin enables the kill switch', async () => {
      // Act
      await putKillSwitch(harness, adminId, { enabled: true });
    });

    And('the plain Voter POSTs a War', async () => {
      // Act
      response = await postWar(harness, voterId);
    });

    Then('the response is 503 war_creation_disabled and no War exists', async () => {
      // Assert
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'war_creation_disabled' });
      expect(await countWars(harness.db)).toBe(0);
    });
  });

  Scenario('Staff cannot create a War while the kill switch is on', ({ Given, When, And, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
    });

    When('the Admin enables the kill switch', async () => {
      // Act
      await putKillSwitch(harness, adminId, { enabled: true });
    });

    And('the Admin POSTs a War', async () => {
      // Act
      response = await postWar(harness, adminId);
    });

    Then('the response is 503 war_creation_disabled and no War exists', async () => {
      // Assert
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'war_creation_disabled' });
      expect(await countWars(harness.db)).toBe(0);
    });
  });

  Scenario('Disabling the kill switch restores War creation', ({ Given, When, And, Then }) => {
    let adminId: string;
    let voterId: string;
    let response: request.Response;

    Given('an Admin and a plain Voter', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('the Admin enables the kill switch', async () => {
      // Act
      await putKillSwitch(harness, adminId, { enabled: true });
    });

    And('the Admin disables the kill switch', async () => {
      // Act
      await putKillSwitch(harness, adminId, { enabled: false });
    });

    And('the plain Voter POSTs a War', async () => {
      // Act
      response = await postWar(harness, voterId);
    });

    Then('the response is 201 and one War exists', async () => {
      // Assert
      expect(response.status).toBe(201);
      expect(await countWars(harness.db)).toBe(1);
    });
  });

  Scenario('A Moderator can toggle the kill switch', ({ Given, When, And, Then }) => {
    let moderatorId: string;
    let putResponse: request.Response;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator enables the kill switch', async () => {
      // Act
      putResponse = await putKillSwitch(harness, moderatorId, { enabled: true });
    });

    And('the Moderator GETs the kill switch', async () => {
      // Act
      response = await getKillSwitch(harness, moderatorId);
    });

    Then('the response is 200 and the kill switch is on', () => {
      // Assert
      expect(putResponse.status).toBe(200);
      expect(putResponse.body).toEqual({ enabled: true });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ enabled: true });
    });
  });

  Scenario('A plain Voter can neither read nor change the kill switch', ({ Given, When, And, Then }) => {
    let moderatorId: string;
    let voterId: string;
    let getResponse: request.Response;
    let putResponse: request.Response;

    Given('a Moderator and a plain Voter', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('the Moderator enables the kill switch', async () => {
      // Act
      await putKillSwitch(harness, moderatorId, { enabled: true });
    });

    And('the plain Voter GETs the kill switch', async () => {
      // Act
      getResponse = await getKillSwitch(harness, voterId);
    });

    And('the plain Voter disables the kill switch', async () => {
      // Act
      putResponse = await putKillSwitch(harness, voterId, { enabled: false });
    });

    Then("both of the plain Voter's responses are 403 and the kill switch is still on", async () => {
      // Assert
      expect(getResponse.status).toBe(403);
      expect(putResponse.status).toBe(403);
      expect((await getKillSwitch(harness, moderatorId)).body).toEqual({ enabled: true });
    });
  });

  Scenario('Enabling the kill switch writes a moderation log entry', ({ Given, When, Then }) => {
    let adminId: string;

    Given('an Admin', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
    });

    When('the Admin enables the kill switch', async () => {
      // Act
      await putKillSwitch(harness, adminId, { enabled: true });
    });

    Then('a moderation log entry records the Admin enabling the kill switch with no target', async () => {
      // Assert
      const rows = await moderationLog(harness.db);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('enable_war_creation_kill_switch');
      expect(rows[0]?.staff_voter_id).toBe(adminId);
      expect(rows[0]?.target_voter_id).toBeNull();
      expect(rows[0]?.target_war_id).toBeNull();
    });
  });

  Scenario('Disabling the kill switch writes a moderation log entry', ({ Given, When, And, Then }) => {
    let moderatorId: string;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator enables the kill switch', async () => {
      // Act
      await putKillSwitch(harness, moderatorId, { enabled: true });
    });

    And('the Moderator disables the kill switch', async () => {
      // Act
      await putKillSwitch(harness, moderatorId, { enabled: false });
    });

    Then('a moderation log entry records the Moderator disabling the kill switch with no target', async () => {
      // Assert
      const rows = (await moderationLog(harness.db)).filter((row) => row.action === 'disable_war_creation_kill_switch');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.staff_voter_id).toBe(moderatorId);
      expect(rows[0]?.target_voter_id).toBeNull();
      expect(rows[0]?.target_war_id).toBeNull();
    });
  });

  Scenario('A refused change writes no moderation log entry', ({ Given, When, Then }) => {
    let voterId: string;
    let response: request.Response;

    Given('a plain Voter', async () => {
      // Arrange
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('the plain Voter enables the kill switch', async () => {
      // Act
      response = await putKillSwitch(harness, voterId, { enabled: true });
    });

    Then('the response is 403 and no moderation log entry exists', async () => {
      // Assert
      expect(response.status).toBe(403);
      expect(await moderationLog(harness.db)).toHaveLength(0);
    });
  });

  Scenario('A malformed change is rejected and writes no moderation log entry', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      // Arrange
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
    });

    When('the Moderator PUTs a kill switch body without enabled', async () => {
      // Act
      response = await putKillSwitch(harness, moderatorId, {});
    });

    Then('the response is 400 and no moderation log entry exists', async () => {
      // Assert
      expect(response.status).toBe(400);
      expect(await moderationLog(harness.db)).toHaveLength(0);
    });
  });
});
