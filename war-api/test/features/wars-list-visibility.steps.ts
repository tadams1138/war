import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { closeWarForTest, makeDraftWar, makeDraftWarWithContestants, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { getWars } from '../setup/apiClient.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/wars-list-visibility.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  function idsOf(response: request.Response): string[] {
    return (response.body.wars as { id: string }[]).map((war) => war.id);
  }

  Scenario(
    'Anonymous listing excludes drafts, unlisted Wars, and unpublished Wars by default',
    ({ Given, When, Then }) => {
      let publishedWarId: string;
      let response: request.Response;

      Given(
        'a voter has created a public published War, a public draft War, a public closed War, and a published unlisted War',
        async () => {
        // Arrange
          const creator = await makeVoter(harness.db, 'creator');

          const { war: publishedWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
            title: 'Public Published War',
          });
          const published = await publishWarForTest(harness.db, publishedWar);
          publishedWarId = published.id;

          await makeDraftWar(harness.db, creator.id, { title: 'Public Draft War' });

          const { war: closedWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
            title: 'Public Closed War',
          });
          const publishedClosed = await publishWarForTest(harness.db, closedWar);
          await closeWarForTest(harness.db, publishedClosed);

          const { war: unlistedWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
            title: 'Published Unlisted War',
            visibility: 'unlisted',
          });
          await publishWarForTest(harness.db, unlistedWar);
        },
      );

      When('anyone GETs /api/v1/wars', async () => {
        // Act
        response = await getWars(harness, );
      });

      Then('only the public published War is returned', () => {
        // Assert
        expect(response.status).toBe(200);
        expect(idsOf(response)).toEqual([publishedWarId]);
      });
    },
  );

  Scenario('Being authenticated grants no extra visibility on its own', ({ Given, When, Then }) => {
    let draftWarId: string;
    let otherVoterId: string;
    let response: request.Response;

    Given('a voter has created a public draft War', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const draft = await makeDraftWar(harness.db, creator.id, { title: 'Someone Else’s Draft' });
      draftWarId = draft.id;

      const other = await makeVoter(harness.db, 'other');
      otherVoterId = other.id;
    });

    When('a different, authenticated voter GETs /api/v1/wars', async () => {
      // Act
      response = await getWars(harness, '', otherVoterId);
    });

    Then('that draft War is not returned', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(draftWarId);
    });
  });

  Scenario('An explicit status filter does not override visibility scoping', ({ Given, When, Then }) => {
    let closedUnlistedWarId: string;
    let response: request.Response;

    Given('a voter has created a closed, unlisted War', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
        title: 'Closed Unlisted War',
        visibility: 'unlisted',
      });
      const published = await publishWarForTest(harness.db, war);
      const closed = await closeWarForTest(harness.db, published);
      closedUnlistedWarId = closed.id;
    });

    When('anyone GETs /api/v1/wars?status=closed', async () => {
      // Act
      response = await getWars(harness, '?status=closed');
    });

    Then('that War is not returned', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(closedUnlistedWarId);
    });
  });

  async function makeExpiredUnclosedWar(title: string): Promise<string> {
    const creator = await makeVoter(harness.db, 'creator');
    const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, { title });
    await publishWarForTest(harness.db, war);
    await harness.db
      .updateTable('wars')
      .set({ ends_at: new Date(Date.now() - 60_000) })
      .where('id', '=', war.id)
      .execute();
    return war.id;
  }

  Scenario(
    'A War whose end date has passed is absent from the default listing before the close task runs',
    ({ Given, When, Then }) => {
      let expiredWarId: string;
      let response: request.Response;

      Given('a voter has created a public published War whose end date passed a minute ago and has not yet been closed by the close task', async () => {
        // Arrange
        expiredWarId = await makeExpiredUnclosedWar('Expired Unclosed War');
      });

      When('anyone GETs /api/v1/wars', async () => {
        // Act
        response = await getWars(harness, );
      });

      Then('that War is not returned', () => {
        // Assert
        expect(response.status).toBe(200);
        expect(idsOf(response)).not.toContain(expiredWarId);
      });
    },
  );

  Scenario(
    'A War whose end date has passed is listed as closed before the close task runs',
    ({ Given, And, When, Then }) => {
      let expiredWarId: string;
      let response: request.Response;

      Given('a voter has created a public published War whose end date passed a minute ago and has not yet been closed by the close task', async () => {
        // Arrange
        expiredWarId = await makeExpiredUnclosedWar('Expired Unclosed War');
      });

      When('anyone GETs /api/v1/wars?status=closed', async () => {
        // Act
        response = await getWars(harness, '?status=closed');
      });

      Then('that War is returned', () => {
        // Assert
        expect(response.status).toBe(200);
        expect(idsOf(response)).toContain(expiredWarId);
      });

      And('that War reports its status as "closed"', () => {
        // Assert
        const listed = (response.body.wars as { id: string; status: string }[]).find((war) => war.id === expiredWarId);
        expect(listed?.status).toBe('closed');
      });
    },
  );

  Scenario('A draft War whose end date has passed is never listed publicly', ({ Given, When, Then }) => {
    let draftWarId: string;
    let response: request.Response;

    Given('a voter has created a public draft War whose end date passed a minute ago', async () => {
      // Arrange
      const creator = await makeVoter(harness.db, 'creator');
      const draft = await makeDraftWar(harness.db, creator.id, { title: 'Expired Draft', endsAt: new Date(Date.now() - 60_000) });
      draftWarId = draft.id;
    });

    When('anyone GETs /api/v1/wars?status=closed', async () => {
      // Act
      response = await getWars(harness, '?status=closed');
    });

    Then('that draft War is not returned', () => {
      // Assert
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(draftWarId);
    });
  });
});
