import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeAdmin, makeDraftWar, makeModerator, makeVoter } from '../setup/fixtures.js';
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

  Scenario('An overly long explanation is rejected', ({ Given, When, Then, And }) => {
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

    When("they POST an explanation longer than 1000 characters to that War's reports", async () => {
      response = await postReport(reporterId, warId, 'a'.repeat(1001));
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

  async function getQueue(voterId: string | undefined): Promise<request.Response> {
    await harness.app.ready();
    const req = request(harness.app.server).get('/api/v1/reports/unaddressed');
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req;
  }

  Scenario('A Moderator sees only Wars with unaddressed reports', ({ Given, When, Then, And }) => {
    let moderatorId: string;
    let unaddressedWarId: string;
    let response: request.Response;

    Given('one War with an unaddressed report and another whose only report is addressed', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const moderator = await makeModerator(harness.db, 'moderator');
      const warNeedingReview = await makeDraftWar(harness.db, creator.id, { title: 'Needs review' });
      const warAllClear = await makeDraftWar(harness.db, creator.id, { title: 'All clear' });
      await postReport(reporter.id, warNeedingReview.id, 'still open');
      const addressedReport = await postReport(reporter.id, warAllClear.id, 'resolved already');
      await harness.db.updateTable('reports').set({ addressed: true }).where('id', '=', addressedReport.body.id).execute();
      moderatorId = moderator.id;
      unaddressedWarId = warNeedingReview.id;
    });

    When('the Moderator GETs the unaddressed-reports queue', async () => {
      response = await getQueue(moderatorId);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And('only the War with the unaddressed report is listed', () => {
      expect(response.body.wars).toHaveLength(1);
      expect(response.body.wars[0].war_id).toBe(unaddressedWarId);
      expect(response.body.wars[0].unaddressed_count).toBe(1);
    });
  });

  Scenario('An Admin without the Moderator flag can also read the queue', ({ Given, When, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin and a War with an unaddressed report', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const admin = await makeAdmin(harness.db, 'admin');
      const war = await makeDraftWar(harness.db, creator.id);
      await postReport(reporter.id, war.id, 'an issue');
      adminId = admin.id;
    });

    When('the Admin GETs the unaddressed-reports queue', async () => {
      response = await getQueue(adminId);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });
  });

  Scenario('A plain Voter cannot read the queue', ({ Given, When, Then }) => {
    let voterId: string;
    let response: request.Response;

    Given('a plain Voter', async () => {
      const voter = await makeVoter(harness.db, 'plain');
      voterId = voter.id;
    });

    When('the plain Voter GETs the unaddressed-reports queue', async () => {
      response = await getQueue(voterId);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  async function patchAddressed(voterId: string | undefined, reportId: string, addressed: boolean): Promise<request.Response> {
    await harness.app.ready();
    const req = request(harness.app.server).patch(`/api/v1/reports/${reportId}`);
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req.send({ addressed });
  }

  Scenario('A Moderator marks a report addressed', ({ Given, When, Then, And }) => {
    let moderatorId: string;
    let reportId: string;
    let response: request.Response;

    Given('a Moderator and an unaddressed report', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const moderator = await makeModerator(harness.db, 'moderator');
      const war = await makeDraftWar(harness.db, creator.id);
      const filed = await postReport(reporter.id, war.id, 'an issue');
      moderatorId = moderator.id;
      reportId = filed.body.id;
    });

    When("the Moderator PATCHes that report's addressed state to true", async () => {
      response = await patchAddressed(moderatorId, reportId, true);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And("the report's addressed state is now true", () => {
      expect(response.body.addressed).toBe(true);
    });
  });

  Scenario('A Moderator reopens a report addressed in error', ({ Given, When, Then, And }) => {
    let moderatorId: string;
    let reportId: string;
    let response: request.Response;

    Given('a Moderator and a report already marked addressed', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const moderator = await makeModerator(harness.db, 'moderator');
      const war = await makeDraftWar(harness.db, creator.id);
      const filed = await postReport(reporter.id, war.id, 'an issue');
      await patchAddressed(moderator.id, filed.body.id, true);
      moderatorId = moderator.id;
      reportId = filed.body.id;
    });

    When("the Moderator PATCHes that report's addressed state to false", async () => {
      response = await patchAddressed(moderatorId, reportId, false);
    });

    Then('the response status is 200', () => {
      expect(response.status).toBe(200);
    });

    And("the report's addressed state is now false", () => {
      expect(response.body.addressed).toBe(false);
    });
  });

  Scenario("A plain Voter cannot change a report's addressed state", ({ Given, When, Then }) => {
    let voterId: string;
    let reportId: string;
    let response: request.Response;

    Given('a plain Voter and an unaddressed report', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const reporter = await makeVoter(harness.db, 'reporter');
      const plainVoter = await makeVoter(harness.db, 'plain');
      const war = await makeDraftWar(harness.db, creator.id);
      const filed = await postReport(reporter.id, war.id, 'an issue');
      voterId = plainVoter.id;
      reportId = filed.body.id;
    });

    When("the plain Voter PATCHes that report's addressed state to true", async () => {
      response = await patchAddressed(voterId, reportId, true);
    });

    Then('the response status is 403', () => {
      expect(response.status).toBe(403);
    });
  });

  Scenario('Addressing a nonexistent report 404s', ({ Given, When, Then }) => {
    let moderatorId: string;
    let response: request.Response;

    Given('a Moderator', async () => {
      const moderator = await makeModerator(harness.db, 'moderator');
      moderatorId = moderator.id;
    });

    When("the Moderator PATCHes a nonexistent report's addressed state to true", async () => {
      response = await patchAddressed(moderatorId, '00000000-0000-0000-0000-000000000000', true);
    });

    Then('the response status is 404', () => {
      expect(response.status).toBe(404);
    });
  });
});
