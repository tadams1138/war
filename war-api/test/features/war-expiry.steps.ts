import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { findWarById } from '../../src/wars/warsRepository.js';
import { expireWar, joinWarAsVoter, makeDraftWarWithContestants, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { anonymous, as, listening, withInternalToken } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/war-expiry.feature', import.meta.url)));

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('An expired War reports as closed before the close task runs', ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a published War whose ends_at passed one minute ago and has not yet been closed by the close task', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await publishWarForTest(harness.db, war);
      await expireWar(harness.db, war.id);
      warId = war.id;
    });

    When('anyone GETs /api/v1/wars/:id', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get(`/api/v1/wars/${warId}`);
    });

    Then('the response status field is "closed"', () => {
      // Assert
      expect((response.body as { status: string }).status).toBe('closed');
    });
  });

  Scenario('Voting is rejected the moment a War expires', ({ Given, When, Then, And }) => {
    let warId: string;
    let matchupId: string;
    let voterId: string;

    Given('a published War whose ends_at passed one second ago and has not yet been closed by the close task', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await publishWarForTest(harness.db, war);
      const matchup = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', war.id).executeTakeFirstOrThrow();
      matchupId = matchup.id;
      const voter = await makeVoter(harness.db, 'voter');
      voterId = voter.id;
      await joinWarAsVoter(harness.db, war.id, voterId);
      await expireWar(harness.db, war.id, 1000);
      warId = war.id;
    });

    let response: request.Response;

    When('a joined voter POSTs a vote', async () => {
      // Act
      await harness.app.ready();
      const matchup = await harness.db.selectFrom('matchups').selectAll().where('id', '=', matchupId).executeTakeFirstOrThrow();
      response = await as(harness, voterId).post(`/api/v1/wars/${warId}/matchups/${matchupId}/vote`, { winner_id: matchup.contestant_a_id });
    });

    Then('the response status is 403', () => {
      // Assert
      expect(response.status).toBe(403);
    });

    And('the response reason is "war_not_published"', () => {
      // Assert
      expect(response.body.reason).toBe('war_not_published');
    });
  });

  Scenario('A War with no end date never expires', ({ Given, When, Then }) => {
    let warId: string;

    Given('a published War with ends_at set to NULL', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await publishWarForTest(harness.db, war);
      warId = war.id;
    });

    When('the close-expired-wars task runs', async () => {
      // Act
      await harness.app.ready();
      await withInternalToken(harness).post('/api/v1/internal/close-expired-wars');
    });

    Then('the War remains "published"', async () => {
      // Assert
      const war = await findWarById(harness.db, warId);
      expect(war?.status).toBe('published');
    });
  });

  Scenario('The close task materializes the stored status', ({ Given, When, Then, And }) => {
    let warId: string;
    let response: request.Response;

    Given('a published War whose ends_at passed six hours ago', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await publishWarForTest(harness.db, war);
      await expireWar(harness.db, war.id, SIX_HOURS_MS);
      warId = war.id;
    });

    When('the close-expired-wars task runs', async () => {
      // Act
      response = await withInternalToken(harness).post('/api/v1/internal/close-expired-wars');
    });

    Then('the stored status column becomes "closed"', async () => {
      // Assert
      const war = await findWarById(harness.db, warId);
      expect(war?.status).toBe('closed');
    });

    And('the response reports 1 War closed', () => {
      // Assert
      expect(response.status).toBe(200);
      expect((response.body as { closed: number }).closed).toBe(1);
    });
  });

  Scenario('The close task is idempotent', ({ Given, When, Then, And }) => {
    let response: request.Response;

    Given('the close-expired-wars task has already closed all expired Wars', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await publishWarForTest(harness.db, war);
      await expireWar(harness.db, war.id, SIX_HOURS_MS);
      await harness.app.ready();
      await withInternalToken(harness).post('/api/v1/internal/close-expired-wars');
    });

    When('it runs again', async () => {
      // Act
      response = await withInternalToken(harness).post('/api/v1/internal/close-expired-wars');
    });

    Then('zero Wars are modified', () => {
      // Assert
      expect((response.body as { closed: number }).closed).toBe(0);
    });

    And('the response status is 200', () => {
      // Assert
      expect(response.status).toBe(200);
    });
  });

  Scenario('The close task is safe to run concurrently', ({ Given, When, Then, And }) => {
    let warId: string;
    let responses: request.Response[];

    Given('a published War whose ends_at passed six hours ago', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await publishWarForTest(harness.db, war);
      await expireWar(harness.db, war.id, SIX_HOURS_MS);
      warId = war.id;
    });

    When('the close-expired-wars task runs twice at the same moment', async () => {
      // Act
      await listening(harness);
      const run = () => withInternalToken(harness).post('/api/v1/internal/close-expired-wars');
      responses = await Promise.all([run(), run()]);
    });

    Then('both responses have status 200', () => {
      // Assert
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
    });

    And('the War\'s stored status is "closed"', async () => {
      // Assert
      const war = await findWarById(harness.db, warId);
      expect(war?.status).toBe('closed');
    });

    And('the two responses together report 1 War closed', () => {
      // Assert
      const total = responses.reduce((sum, response) => sum + (response.body as { closed: number }).closed, 0);
      expect(total).toBe(1);
    });
  });

  Scenario('Internal endpoints reject a wrong token', ({ When, Then, And }) => {
    let response: request.Response;
    let warsBefore: unknown[];

    When('POST /api/v1/internal/close-expired-wars is called with a wrong X-Internal-Token', async () => {
      // Act
      warsBefore = await harness.db.selectFrom('wars').selectAll().execute();
      response = await withInternalToken(harness, 'wrong-token').post('/api/v1/internal/close-expired-wars');
    });

    Then('the response status is 401', () => {
      // Assert
      expect(response.status).toBe(401);
    });

    And('no War records are modified', async () => {
      // Assert
      const warsAfter = await harness.db.selectFrom('wars').selectAll().execute();
      expect(warsAfter).toEqual(warsBefore);
    });
  });

  Scenario('Internal endpoints reject a missing token', ({ When, Then, And }) => {
    let response: request.Response;
    let warsBefore: unknown[];

    When('POST /api/v1/internal/close-expired-wars is called with no X-Internal-Token', async () => {
      // Act
      warsBefore = await harness.db.selectFrom('wars').selectAll().execute();
      response = await anonymous(harness).post('/api/v1/internal/close-expired-wars');
    });

    Then('the response status is 401', () => {
      // Assert
      expect(response.status).toBe(401);
    });

    And('no War records are modified', async () => {
      // Assert
      const warsAfter = await harness.db.selectFrom('wars').selectAll().execute();
      expect(warsAfter).toEqual(warsBefore);
    });
  });

  Scenario('Internal endpoints do not accept user JWTs', ({ Given, When, Then }) => {
    let jwt: string;
    let response: request.Response;

    Given('a valid user JWT for any voter', async () => {
      // Arrange
      const voter = await makeVoter(harness.db, 'someone');
      jwt = await harness.jwtFor(voter.id);
    });

    When('POST /api/v1/internal/close-expired-wars is called with that JWT and no internal token', async () => {
      // Act
      await harness.app.ready();
      response = await request(harness.app.server)
        .post('/api/v1/internal/close-expired-wars')
        .set('Authorization', `Bearer ${jwt}`)
        .send();
    });

    Then('the response status is 401', () => {
      // Assert
      expect(response.status).toBe(401);
    });
  });

  Scenario('A draft whose end date passes stays hidden from everyone but its creator', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a draft War whose ends_at passed one minute ago', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2);
      await expireWar(harness.db, war.id);
      warId = war.id;
      creatorId = creator.id;
    });

    When('another Voter GETs /api/v1/wars/:id', async () => {
      // Act
      const other = await makeVoter(harness.db, 'other');
      response = await as(harness, other.id).get(`/api/v1/wars/${warId}`);
    });

    Then('the response status is 404', () => {
      // Assert
      expect(response.status).toBe(404);
    });

    And('its creator still sees it, reported as closed', async () => {
      // Assert
      const own = await as(harness, creatorId).get(`/api/v1/wars/${warId}`);
      expect(own.status).toBe(200);
      expect(own.body.status).toBe('closed');
    });
  });
});
