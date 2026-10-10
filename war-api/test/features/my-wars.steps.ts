import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { closeWarForTest, expireWar, makeDraftWar, makeDraftWarWithContestants, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { anonymous, getWars } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/my-wars.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  async function getWarsWithAuthHeader(query: string, authorization: string): Promise<request.Response> {
    return anonymous(harness).get(`/api/v1/wars${query}`, { headers: { Authorization: authorization } });
  }

  function idsOf(response: request.Response): string[] {
    return (response.body.wars as { id: string }[]).map((war) => war.id);
  }

  Scenario('A voter lists the Wars they created, across every status', ({ Given, And, When, Then }) => {
    let creatorId: string;
    let draftId: string;
    let publishedId: string;
    let closedId: string;
    let response: request.Response;

    Given('a voter has created a draft War, a published War, and a closed War', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;

      const draft = await makeDraftWar(harness.db, creatorId, { title: 'My Draft War' });
      draftId = draft.id;

      const { war: publishedWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2, {
        title: 'My Published War',
      });
      const published = await publishWarForTest(harness.db, publishedWar);
      publishedId = published.id;

      const { war: closedWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2, {
        title: 'My Closed War',
      });
      const publishedClosed = await publishWarForTest(harness.db, closedWar);
      const closed = await closeWarForTest(harness.db, publishedClosed);
      closedId = closed.id;
    });

    And('another voter has created a public published War', async () => {
      // Arrange
      const other = await makeVoter(harness.db, 'other');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, other.id, 2, {
        title: "Someone Else's War",
      });
      await publishWarForTest(harness.db, war);
    });

    When('they GET /api/v1/wars?creator=me', async () => {
      // Act
      response = await getWars(harness, '?creator=me', creatorId);
    });

    Then("only the requester's three Wars are returned", () => {
      // Assert
      expect(response.status).toBe(200);
      const ids = idsOf(response);
      expect(ids).toHaveLength(3);
      expect(ids).toEqual(expect.arrayContaining([draftId, publishedId, closedId]));
    });
  });

  Scenario('creator=me combines with the status filter', ({ Given, And, When, Then }) => {
    let creatorId: string;
    let draftId: string;
    let response: request.Response;

    Given('a voter has created a draft War and a published War', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;

      const draft = await makeDraftWar(harness.db, creatorId, { title: 'My Draft War' });
      draftId = draft.id;

      const { war: publishedWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2, {
        title: 'My Published War',
      });
      await publishWarForTest(harness.db, publishedWar);
    });

    And('another voter has created a draft War', async () => {
      // Arrange
      const other = await makeVoter(harness.db, 'other');
      await makeDraftWar(harness.db, other.id, { title: "Someone Else's Draft War" });
    });

    When('they GET /api/v1/wars?creator=me&status=draft', async () => {
      // Act
      response = await getWars(harness, '?creator=me&status=draft', creatorId);
    });

    Then('only their own draft War is returned', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(idsOf(response)).toEqual([draftId]);
    });
  });

  Scenario('An unauthenticated request for creator=me is rejected', ({ When, Then }) => {
    let response: request.Response;

    When('an unauthenticated caller GETs /api/v1/wars?creator=me', async () => {
      // Act
      response = await getWars(harness, '?creator=me');
    });

    Then('the response status is 401', () => {
      // Assert
      expect(response.status).toBe(401);
    });
  });

  Scenario('A request for creator=me with an invalid or expired token is rejected', ({ When, Then }) => {
    let response: request.Response;

    When('a caller bearing an invalid or expired JWT GETs /api/v1/wars?creator=me', async () => {
      // Act
      response = await getWarsWithAuthHeader('?creator=me', 'Bearer not-a-real-jwt');
    });

    Then('the response status is 401', () => {
      // Assert
      expect(response.status).toBe(401);
    });
  });

  Scenario("A voter's own unlisted or draft Wars are included, and another voter's are not", ({ Given, And, When, Then }) => {
    let creatorId: string;
    let warId: string;
    let otherWarId: string;
    let response: request.Response;

    Given('a voter has created a draft, unlisted War', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const war = await makeDraftWar(harness.db, creatorId, { title: 'Unlisted Draft', visibility: 'unlisted' });
      warId = war.id;
    });

    And('another voter has created a draft, unlisted War', async () => {
      // Arrange
      const other = await makeVoter(harness.db, 'other');
      const war = await makeDraftWar(harness.db, other.id, {
        title: "Someone Else's Unlisted Draft",
        visibility: 'unlisted',
      });
      otherWarId = war.id;
    });

    When('they GET /api/v1/wars?creator=me', async () => {
      // Act
      response = await getWars(harness, '?creator=me', creatorId);
    });

    Then('their own unlisted draft War is returned', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(idsOf(response)).toContain(warId);
    });

    And("the other voter's is not", () => {
      // Assert
      expect(idsOf(response)).not.toContain(otherWarId);
    });
  });

  Scenario('A creator value other than "me" is rejected', ({ When, Then, And }) => {
    let response: request.Response;

    When('they GET /api/v1/wars?creator=someone-else', async () => {
      // Act
      response = await getWars(harness, '?creator=someone-else');
    });

    Then('the response status is 400', () => {
      // Assert
      expect(response.status).toBe(400);
    });

    And("the response is Fastify's own validation-error envelope, not this API's \"error\" shape", () => {
      // Assert
      expect(response.body).toMatchObject({ statusCode: 400, code: 'FST_ERR_VALIDATION', error: 'Bad Request' });
      expect(response.body.message).toEqual(expect.any(String));
    });
  });

  function statusOf(response: request.Response, warId: string): string | undefined {
    return (response.body.wars as { id: string; status: string }[]).find((war) => war.id === warId)?.status;
  }

  Scenario('creator=me filters by effective status before the close task runs', ({ Given, When, Then }) => {
    let creatorId: string;
    let expiredId: string;
    let response: request.Response;

    Given('a voter has created a published War whose end date passed a minute ago and has not yet been closed by the close task', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creatorId, 2, { title: 'Expired Unclosed' });
      await publishWarForTest(harness.db, war);
      await expireWar(harness.db, war.id);
      expiredId = war.id;
    });

    When('they GET /api/v1/wars?creator=me&status=closed', async () => {
      // Act
      response = await getWars(harness, '?creator=me&status=closed', creatorId);
    });

    Then('their expired War is returned as "closed"', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(statusOf(response, expiredId)).toBe('closed');
    });

    When('they GET /api/v1/wars?creator=me&status=published', async () => {
      // Act
      response = await getWars(harness, '?creator=me&status=published', creatorId);
    });

    Then('their expired War is not returned', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(expiredId);
    });
  });

  Scenario("A voter's own draft whose end date has passed counts as closed", ({ Given, When, Then }) => {
    let creatorId: string;
    let expiredDraftId: string;
    let response: request.Response;

    Given('a voter has created a draft War whose end date passed a minute ago', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      creatorId = creator.id;
      const draft = await makeDraftWar(harness.db, creatorId, { title: 'Expired Draft' });
      await expireWar(harness.db, draft.id);
      expiredDraftId = draft.id;
    });

    When('they GET /api/v1/wars?creator=me&status=closed', async () => {
      // Act
      response = await getWars(harness, '?creator=me&status=closed', creatorId);
    });

    Then('their expired draft War is returned as "closed"', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(statusOf(response, expiredDraftId)).toBe('closed');
    });

    When('they GET /api/v1/wars?creator=me&status=draft', async () => {
      // Act
      response = await getWars(harness, '?creator=me&status=draft', creatorId);
    });

    Then('their expired draft War is not returned', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(expiredDraftId);
    });
  });
});
