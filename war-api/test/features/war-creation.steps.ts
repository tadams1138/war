import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeDraftWar, makeDraftWarWithContestants, activateWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/war-creation.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('An authenticated voter creates a War', ({ Given, When, Then, And }) => {
    let creatorId: string;
    let response: request.Response;

    Given('an authenticated voter', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
    });

    When('they POST a title to /api/v1/wars', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post('/api/v1/wars')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ title: 'Miss Universe 2026' });
    });

    Then('a new War is created in "draft" status', () => {
      expect(response.status).toBe(201);
      expect(response.body.status).toBe('draft');
    });

    And('its visibility defaults to "public"', () => {
      expect(response.body.visibility).toBe('public');
    });
  });

  Scenario('A title is required', ({ Given, When, Then, And }) => {
    let creatorId: string;
    let response: request.Response;

    Given('an authenticated voter', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
    });

    When('they POST to /api/v1/wars with no title', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post('/api/v1/wars')
        .set('Authorization', `Bearer ${jwt}`)
        .send({});
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('no War is created', async () => {
      const rows = await harness.db.selectFrom('wars').selectAll().where('creator_id', '=', creatorId).execute();
      expect(rows).toHaveLength(0);
    });
  });

  Scenario('An unauthenticated request cannot create a War', ({ Given, When, Then }) => {
    let response: request.Response;

    Given('a request with no Authorization header', () => {
      // Nothing to arrange -- the request below simply omits the header.
    });

    When('they POST to /api/v1/wars', async () => {
      await harness.app.ready();
      response = await request(harness.app.server).post('/api/v1/wars').send({ title: 'Some War' });
    });

    Then('the response status is 401', () => {
      expect(response.status).toBe(401);
    });
  });

  Scenario('The creator adds a contestant to their draft War', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a draft War created by the requester', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creatorId);
      warId = war.id;
    });

    When('they POST a name to /api/v1/wars/:id/contestants', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Maria' });
    });

    Then('the contestant is created', () => {
      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Maria');
    });

    And("it appears in the War's contestant list", async () => {
      const warResponse = await request(harness.app.server).get(`/api/v1/wars/${warId}`);
      const names = (warResponse.body.contestants as { name: string }[]).map((c) => c.name);
      expect(names).toContain('Maria');
    });
  });

  Scenario('A contestant name is required', ({ Given, When, Then, And }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('a draft War created by the requester', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creatorId);
      warId = war.id;
    });

    When('they POST to /api/v1/wars/:id/contestants with no name', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({});
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('no contestant is created', async () => {
      const rows = await harness.db.selectFrom('contestants').selectAll().where('war_id', '=', warId).execute();
      expect(rows).toHaveLength(0);
    });
  });

  Scenario('A non-creator cannot add a contestant', ({ Given, When, Then }) => {
    let warId: string;
    let voterBId: string;
    let response: request.Response;

    Given('a War created by Voter A', async () => {
      const voterA = await makeVoter(harness.db, 'voter-a');
      const voterB = await makeVoter(harness.db, 'voter-b');
      voterBId = voterB.id;
      const war = await makeDraftWar(harness.db, voterA.id);
      warId = war.id;
    });

    When('Voter B POSTs a contestant to it', async () => {
      await harness.app.ready();
      const jwt = await harness.jwtFor(voterBId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Someone' });
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('A contestant cannot be added once the War is active', ({ Given, When, Then }) => {
    let warId: string;
    let creatorId: string;
    let response: request.Response;

    Given('an active War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2);
      await activateWarForTest(harness.db, war);
      warId = war.id;
      await harness.app.ready();
    });

    When('its creator POSTs a new contestant', async () => {
      const jwt = await harness.jwtFor(creatorId);
      response = await request(harness.app.server)
        .post(`/api/v1/wars/${warId}/contestants`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Latecomer' });
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });
});
