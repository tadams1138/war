import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { makeVoter, makeDraftWar, makeDraftWarWithContestants, publishWarForTest, closeWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/wars-list-visibility.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
    await harness.app.ready();
  });

  async function getWars(query = '', voterId?: string): Promise<request.Response> {
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

  Scenario(
    'Anonymous listing excludes drafts, invite-only Wars, and non-active Wars by default',
    ({ Given, When, Then }) => {
      let activeWarId: string;
      let response: request.Response;

      Given(
        'a voter has created a public active War, a public draft War, a public closed War, and an active invite-only War',
        async () => {
          const creator = await makeVoter(harness.db, 'creator');

          const { war: activeWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
            title: 'Public Active War',
          });
          const active = await publishWarForTest(harness.db, activeWar);
          activeWarId = active.id;

          await makeDraftWar(harness.db, creator.id, { title: 'Public Draft War' });

          const { war: closedWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
            title: 'Public Closed War',
          });
          const activatedClosed = await publishWarForTest(harness.db, closedWar);
          await closeWarForTest(harness.db, activatedClosed);

          const { war: inviteOnlyWar } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
            title: 'Active Invite Only War',
            visibility: 'invite_only',
          });
          await publishWarForTest(harness.db, inviteOnlyWar);
        },
      );

      When('anyone GETs /api/v1/wars', async () => {
        response = await getWars();
      });

      Then('only the public active War is returned', () => {
        expect(response.status).toBe(200);
        expect(idsOf(response)).toEqual([activeWarId]);
      });
    },
  );

  Scenario('Being authenticated grants no extra visibility on its own', ({ Given, When, Then }) => {
    let draftWarId: string;
    let otherVoterId: string;
    let response: request.Response;

    Given('a voter has created a public draft War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const draft = await makeDraftWar(harness.db, creator.id, { title: 'Someone Else’s Draft' });
      draftWarId = draft.id;

      const other = await makeVoter(harness.db, 'other');
      otherVoterId = other.id;
    });

    When('a different, authenticated voter GETs /api/v1/wars', async () => {
      response = await getWars('', otherVoterId);
    });

    Then('that draft War is not returned', () => {
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(draftWarId);
    });
  });

  Scenario('An explicit status filter does not override visibility scoping', ({ Given, When, Then }) => {
    let closedInviteOnlyWarId: string;
    let response: request.Response;

    Given('a voter has created a closed, invite-only War', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const { war } = await makeDraftWarWithContestants(harness.db, harness.storage, creator.id, 2, {
        title: 'Closed Invite Only War',
        visibility: 'invite_only',
      });
      const active = await publishWarForTest(harness.db, war);
      const closed = await closeWarForTest(harness.db, active);
      closedInviteOnlyWarId = closed.id;
    });

    When('anyone GETs /api/v1/wars?status=closed', async () => {
      response = await getWars('?status=closed');
    });

    Then('that War is not returned', () => {
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(closedInviteOnlyWarId);
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
    ({ Given, And, When, Then }) => {
      let expiredWarId: string;
      let response: request.Response;

      Given('a voter has created a public published War whose end date passed a minute ago', async () => {
        expiredWarId = await makeExpiredUnclosedWar('Expired Unclosed War');
      });

      And('the close-expired-wars task has not yet run', () => {
        // No-op: nothing in this scenario calls the internal endpoint.
      });

      When('anyone GETs /api/v1/wars', async () => {
        response = await getWars();
      });

      Then('that War is not returned', () => {
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

      Given('a voter has created a public published War whose end date passed a minute ago', async () => {
        expiredWarId = await makeExpiredUnclosedWar('Expired Unclosed War');
      });

      And('the close-expired-wars task has not yet run', () => {
        // No-op: nothing in this scenario calls the internal endpoint.
      });

      When('anyone GETs /api/v1/wars?status=closed', async () => {
        response = await getWars('?status=closed');
      });

      Then('that War is returned', () => {
        expect(response.status).toBe(200);
        expect(idsOf(response)).toContain(expiredWarId);
      });

      And('that War reports its status as "closed"', () => {
        const listed = (response.body.wars as { id: string; status: string }[]).find((war) => war.id === expiredWarId);
        expect(listed?.status).toBe('closed');
      });
    },
  );

  Scenario('A draft War whose end date has passed is never listed publicly', ({ Given, When, Then }) => {
    let draftWarId: string;
    let response: request.Response;

    Given('a voter has created a public draft War whose end date passed a minute ago', async () => {
      const creator = await makeVoter(harness.db, 'creator');
      const draft = await makeDraftWar(harness.db, creator.id, { title: 'Expired Draft', endsAt: new Date(Date.now() - 60_000) });
      draftWarId = draft.id;
    });

    When('anyone GETs /api/v1/wars?status=closed', async () => {
      response = await getWars('?status=closed');
    });

    Then('that draft War is not returned', () => {
      expect(response.status).toBe(200);
      expect(idsOf(response)).not.toContain(draftWarId);
    });
  });
});
