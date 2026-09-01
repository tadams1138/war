import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import {
  makeVoter,
  makeDraftWar,
  makeDraftWarWithContestants,
  activateWarForTest,
  closeWarForTest,
} from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/my-wars.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  async function getWars(query: string, voterId?: string): Promise<request.Response> {
    const req = request(harness.app.server).get(`/api/v1/wars${query}`);
    if (voterId) {
      const jwt = await harness.jwtFor(voterId);
      req.set('Authorization', `Bearer ${jwt}`);
    }
    return req;
  }

  function idsOf(response: request.Response): string[] {
    return (response.body.wars as { id: string }[]).map((war) => war.id);
  }

  Scenario('A voter lists the Wars they created, across every status', ({ Given, And, When, Then }) => {
    let creatorId: string;
    let draftId: string;
    let activeId: string;
    let closedId: string;
    let response: request.Response;

    Given('a voter has created a draft War, an active War, and a closed War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;

      const draft = await makeDraftWar(harness.db, creatorId, { title: 'My Draft War' });
      draftId = draft.id;

      const { war: activeWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2, {
        title: 'My Active War',
      });
      const active = await activateWarForTest(harness.db, activeWar);
      activeId = active.id;

      const { war: closedWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2, {
        title: 'My Closed War',
      });
      const activatedClosed = await activateWarForTest(harness.db, closedWar);
      const closed = await closeWarForTest(harness.db, activatedClosed);
      closedId = closed.id;
    });

    And('another voter has created a public active War', async () => {
      const other = await makeVoter(harness.db, 'other');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, other.id, 2, {
        title: "Someone Else's War",
      });
      await activateWarForTest(harness.db, war);
    });

    When('they GET /api/v1/wars?creator=me', async () => {
      response = await getWars('?creator=me', creatorId);
    });

    Then("only the requester's three Wars are returned", () => {
      expect(response.status).toBe(200);
      const ids = idsOf(response);
      expect(ids).toHaveLength(3);
      expect(ids).toEqual(expect.arrayContaining([draftId, activeId, closedId]));
    });
  });

  Scenario('creator=me combines with the status filter', ({ Given, When, Then }) => {
    let creatorId: string;
    let draftId: string;
    let response: request.Response;

    Given('a voter has created a draft War and an active War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;

      const draft = await makeDraftWar(harness.db, creatorId, { title: 'My Draft War' });
      draftId = draft.id;

      const { war: activeWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2, {
        title: 'My Active War',
      });
      await activateWarForTest(harness.db, activeWar);
    });

    When('they GET /api/v1/wars?creator=me&status=draft', async () => {
      response = await getWars('?creator=me&status=draft', creatorId);
    });

    Then('only their draft War is returned', () => {
      expect(response.status).toBe(200);
      expect(idsOf(response)).toEqual([draftId]);
    });
  });

  Scenario('An unauthenticated request for creator=me is rejected', ({ Given, When, Then }) => {
    let response: request.Response;

    Given('a request with no Authorization header', () => {
      // Nothing to arrange -- the request below simply omits the header.
    });

    When('they GET /api/v1/wars?creator=me', async () => {
      response = await getWars('?creator=me');
    });

    Then('the response status is 401', () => {
      expect(response.status).toBe(401);
    });
  });

  Scenario("A voter's own invite-only or draft Wars are included", ({ Given, When, Then }) => {
    let creatorId: string;
    let warId: string;
    let response: request.Response;

    Given('a voter has created a draft, invite-only War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creatorId, { title: 'Invite Only Draft', visibility: 'invite_only' });
      warId = war.id;
    });

    When('they GET /api/v1/wars?creator=me', async () => {
      response = await getWars('?creator=me', creatorId);
    });

    Then('that War is included in the results', () => {
      expect(response.status).toBe(200);
      expect(idsOf(response)).toContain(warId);
    });
  });
});
