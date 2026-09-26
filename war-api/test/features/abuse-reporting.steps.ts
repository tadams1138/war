import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeDraftWar, makeModerator, makeVoter } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/abuse-reporting.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  async function postReport(voterId: string | undefined, warId: string, explanation: string | undefined): Promise<request.Response> {
    await harness.app.ready();
    const req = request(harness.app.server).post(`/api/v1/wars/${warId}/reports`);
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req.send(explanation === undefined ? {} : { explanation });
  }

  Scenario('Any authenticated Voter can report a War', ({ Given, When, Then, And }) => {
    let reporterId: string;
    let warId: string;
    let response: request.Response;

    Given('an authenticated Voter and a War created by someone else', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const war = await makeDraftWar(harness.db, creator.id);
      reporterId = reporter.id;
      warId = war.id;
    });

    When("they POST an explanation to that War's reports", async () => {
      response = await postReport(reporterId, warId, 'votes look spammed');
    });

    Then('the response status is 201', () => {
      expect(response.status).toBe(201);
    });

    And("the response carries the explanation and the reporter's id", () => {
      expect(response.body.explanation).toBe('votes look spammed');
      expect(response.body.reporter_id).toBe(reporterId);
    });

    And("the report's addressed state is false", () => {
      expect(response.body.addressed).toBe(false);
    });
  });

  Scenario('A Voter may report the same War more than once', ({ Given, When, Then, And }) => {
    let reporterId: string;
    let warId: string;
    let first: request.Response;
    let second: request.Response;

    Given('an authenticated Voter and a War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const war = await makeDraftWar(harness.db, creator.id);
      reporterId = reporter.id;
      warId = war.id;
    });

    When('they POST two different explanations to that War\'s reports', async () => {
      first = await postReport(reporterId, warId, 'first issue');
      second = await postReport(reporterId, warId, 'second issue');
    });

    Then('both requests succeed', () => {
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });

    And('two separate reports exist against that War', async () => {
      const rows = await harness.db.selectFrom('reports').selectAll().where('war_id', '=', warId).execute();
      expect(rows).toHaveLength(2);
    });
  });

  Scenario('An empty explanation is rejected', ({ Given, When, Then, And }) => {
    let reporterId: string;
    let warId: string;
    let response: request.Response;

    Given('an authenticated Voter and a War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const war = await makeDraftWar(harness.db, creator.id);
      reporterId = reporter.id;
      warId = war.id;
    });

    When('they POST an empty-string explanation to that War\'s reports', async () => {
      response = await postReport(reporterId, warId, '');
    });

    Then('the response status is 422', () => {
      expect(response.status).toBe(422);
    });

    And('no report is created', async () => {
      const rows = await harness.db.selectFrom('reports').selectAll().where('war_id', '=', warId).execute();
      expect(rows).toHaveLength(0);
    });
  });

  Scenario('Reporting a nonexistent War 404s', ({ Given, When, Then }) => {
    let reporterId: string;
    let response: request.Response;

    Given('an authenticated Voter', async () => {
      const reporter = await makeVoter(harness.db, 'reporter');
      reporterId = reporter.id;
    });

    When("they POST an explanation to a nonexistent War's reports", async () => {
      response = await postReport(reporterId, '00000000-0000-0000-0000-000000000000', 'anything');
    });

    Then('the response status is 404', () => {
      expect(response.status).toBe(404);
    });
  });

  Scenario('An unauthenticated request cannot file a report', ({ Given, When, Then }) => {
    let warId: string;
    let response: request.Response;

    Given('a request with no Authorization header', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const war = await makeDraftWar(harness.db, creator.id);
      warId = war.id;
    });

    When("they POST an explanation to a War's reports", async () => {
      response = await postReport(undefined, warId, 'anything');
    });

    Then('the response status is 401', () => {
      expect(response.status).toBe(401);
    });
  });

  async function getReports(voterId: string | undefined, warId: string): Promise<request.Response> {
    await harness.app.ready();
    const req = request(harness.app.server).get(`/api/v1/wars/${warId}/reports`);
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req;
  }

  Scenario('A Moderator lists every report against a War', ({ Given, When, Then, And }) => {
    let moderatorId: string;
    let warId: string;
    let response: request.Response;

    Given('a War with two reports against it and a Moderator', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const moderator = await makeModerator(harness.db, 'moderator');
      const war = await makeDraftWar(harness.db, creator.id);
      await postReport(reporter.id, war.id, 'first');
      await postReport(reporter.id, war.id, 'second');
      moderatorId = moderator.id;
      warId = war.id;
    });

    When("the Moderator GETs that War's reports", async () => {
      response = await getReports(moderatorId, warId);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('both reports are listed, newest first', () => {
      expect(response.body.reports).toHaveLength(2);
      expect(response.body.reports[0].explanation).toBe('second');
      expect(response.body.reports[1].explanation).toBe('first');
    });
  });

  Scenario("The War's own creator cannot see its reports", ({ Given, When, Then }) => {
    let creatorId: string;
    let warId: string;
    let response: request.Response;

    Given('a War with a report against it', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const war = await makeDraftWar(harness.db, creator.id);
      await postReport(reporter.id, war.id, 'an issue');
      creatorId = creator.id;
      warId = war.id;
    });

    When("its creator GETs that War's reports", async () => {
      response = await getReports(creatorId, warId);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('A plain Voter cannot list reports for a War', ({ Given, When, Then }) => {
    let voterId: string;
    let warId: string;
    let response: request.Response;

    Given('a War with a report against it and a plain Voter', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const plainVoter = await makeVoter(harness.db, 'plain');
      const war = await makeDraftWar(harness.db, creator.id);
      await postReport(reporter.id, war.id, 'an issue');
      voterId = plainVoter.id;
      warId = war.id;
    });

    When('the plain Voter GETs that War\'s reports', async () => {
      response = await getReports(voterId, warId);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });
});
