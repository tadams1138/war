import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { randomUUID } from 'node:crypto';
import { beginLogin, loginAndCallback, postRefresh } from '../setup/authFlow.js';
import { extractCookieValue } from '../setup/httpHelpers.js';
import { newId } from '../../src/db/uuid.js';
import { recomputeContestantCounters } from '../../src/contestants/contestantsRepository.js';
import { markWarRemoved } from '../../src/wars/warsRepository.js';
import { joinWarAsVoter, makeAdmin, makeDraftWar, makeDraftWarWithContestants, makeModerator, makeVoter, publishWarForTest } from '../setup/fixtures.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/ban-voter.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  async function putBan(callerId: string, targetId: string, banned: boolean): Promise<request.Response> {
    await harness.app.ready();
    const jwt = await harness.jwtFor(callerId);
    return request(harness.app.server)
      .put(`/api/v1/voters/${targetId}/ban`)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ banned });
  }

  async function logRows() {
    return harness.db.selectFrom('moderation_log').selectAll().execute();
  }

  Scenario('An Admin bans a Voter and the ban is logged', ({ Given, When, Then }) => {
    let adminId: string;
    let voterId: string;
    let response: request.Response;

    Given('an Admin and a plain Voter', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
    });

    When('the Admin bans the Voter', async () => {
      // Act
      response = await putBan(adminId, voterId, true);
    });

    Then('the response is 200 with the Voter banned and a ban_voter log entry names the Admin and the Voter', async () => {
      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: voterId, suspended: false, banned: true });
      const rows = await logRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('ban_voter');
      expect(rows[0]?.staff_voter_id).toBe(adminId);
      expect(rows[0]?.target_voter_id).toBe(voterId);
    });
  });

  Scenario("A banned Voter's existing access token stops working immediately", ({ Given, When, Then }) => {
    let adminId: string;
    let voterId: string;
    let voterJwt: string;

    Given('an Admin and a plain Voter with a valid access token', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
      voterJwt = await harness.jwtFor(voterId);
    });

    When('the Admin bans the Voter', async () => {
      // Act
      await putBan(adminId, voterId, true);
    });

    Then("the Voter's token gets 401 on an authenticated route and is anonymous on an optional-auth route", async () => {
      // Assert
      const me = await request(harness.app.server).get('/api/v1/auth/me').set('Authorization', `Bearer ${voterJwt}`);
      expect(me.status).toBe(401);
      // A draft War is visible only to its creator, so a 404 shows the banned token was treated as anonymous.
      const draft = await makeDraftWar(harness.db, voterId);
      const detail = await request(harness.app.server).get(`/api/v1/wars/${draft.id}`).set('Authorization', `Bearer ${voterJwt}`);
      expect(detail.status).toBe(404);
    });
  });

  async function signIn(seed: string): Promise<{ voterId: string; refreshTokenValue: string }> {
    const { refreshTokenValue } = await loginAndCallback(harness, { providerUserId: seed, displayName: seed, avatarUrl: null });
    const row = await harness.db.selectFrom('voters').select('id').where('provider_user_id', '=', seed).executeTakeFirstOrThrow();
    return { voterId: row.id, refreshTokenValue };
  }

  Scenario('A banned Voter cannot refresh', ({ Given, When, Then }) => {
    let adminId: string;
    let voterId: string;
    let refreshTokenValue: string;

    Given('an Admin and a Voter who signed in', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      ({ voterId, refreshTokenValue } = await signIn('signed-in-voter'));
    });

    When('the Admin bans the Voter', async () => {
      // Act
      await putBan(adminId, voterId, true);
    });

    Then("refreshing with the Voter's refresh token gets 401", async () => {
      // Assert
      const response = await postRefresh(harness, refreshTokenValue);
      expect(response.status).toBe(401);
    });
  });

  async function callbackFor(seed: string): Promise<request.Response> {
    const { agent, stateCookie, cookieHeader } = await beginLogin(harness);
    const code = randomUUID();
    harness.google.registerCode(code, { providerUserId: seed, displayName: seed, avatarUrl: null });
    return agent.get('/api/v1/auth/google/callback').query({ code, state: stateCookie }).set('Cookie', cookieHeader);
  }

  Scenario('A banned Voter cannot sign in', ({ Given, When, And, Then }) => {
    let adminId: string;
    let voterId: string;
    let callbackResponse: request.Response;

    Given('an Admin and a Voter who signed in', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      ({ voterId } = await signIn('returning-voter'));
    });

    When('the Admin bans the Voter', async () => {
      // Act
      await putBan(adminId, voterId, true);
    });

    And('the Voter completes the OAuth callback again', async () => {
      callbackResponse = await callbackFor('returning-voter');
    });

    Then('the callback redirects to the UI with error banned and issues no refresh token', async () => {
      // Assert
      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.get('Location')).toBe('https://app.test/auth/callback?error=banned');
      expect(extractCookieValue(callbackResponse.get('Set-Cookie'), 'refresh_token')).toBeUndefined();
      const families = await harness.db.selectFrom('refresh_tokens').selectAll().execute();
      expect(families).toHaveLength(1);
    });
  });

  async function castVote(warId: string, voterId: string): Promise<void> {
    const matchup = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', warId).executeTakeFirstOrThrow();
    await harness.db
      .insertInto('votes')
      .values({
        id: newId(),
        matchup_id: matchup.id,
        voter_id: voterId,
        winner_id: matchup.contestant_a_id,
        presented_left_id: matchup.contestant_a_id,
      })
      .execute();
  }

  async function count(table: 'wars' | 'contestants' | 'matchups' | 'votes' | 'contestant_media'): Promise<number> {
    return (await harness.db.selectFrom(table).selectAll().execute()).length;
  }

  function storedObjectCount(): number {
    return harness.storage.publicObjects.size + harness.storage.privateObjects.size;
  }

  Scenario('Banning deletes every War the Voter created', ({ Given, And, When, Then }) => {
    let adminId: string;
    let voterId: string;
    let publishedWarId: string;

    Given("an Admin and a Voter who created a draft, a published and a removed War, each with contestants and images", async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
      await makeDraftWarWithContestants(harness.db, harness.storage, voterId, 2);
      const published = await makeDraftWarWithContestants(harness.db, harness.storage, voterId, 2);
      publishedWarId = (await publishWarForTest(harness.db, published.war)).id;
      const removed = await makeDraftWarWithContestants(harness.db, harness.storage, voterId, 2);
      await markWarRemoved(harness.db, removed.war.id);
    });

    And("another Voter voted in the Voter's published War", async () => {
      const otherId = (await makeVoter(harness.db, 'other')).id;
      await joinWarAsVoter(harness.db, publishedWarId, otherId);
      await castVote(publishedWarId, otherId);
    });

    When('the Admin bans the Voter', async () => {
      // Act
      await putBan(adminId, voterId, true);
    });

    Then('none of those Wars or their contestants, matchups, votes and media rows remain', async () => {
      // Assert
      expect(await count('wars')).toBe(0);
      expect(await count('contestants')).toBe(0);
      expect(await count('matchups')).toBe(0);
      expect(await count('votes')).toBe(0);
      expect(await count('contestant_media')).toBe(0);
    });

    And('their stored media objects are gone', () => {
      expect(storedObjectCount()).toBe(0);
    });
  });

  Scenario("Banning removes the Voter's votes and memberships elsewhere and leaves other data untouched", ({ Given, When, Then, And }) => {
    let adminId: string;
    let voterId: string;
    let otherVoterId: string;
    let warId: string;
    let contestantIds: string[];

    Given("an Admin, a Voter, and another Voter's published War in which both Voters voted differently", async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
      otherVoterId = (await makeVoter(harness.db, 'other')).id;
      const { war, contestants } = await makeDraftWarWithContestants(harness.db, harness.storage, otherVoterId, 2);
      warId = (await publishWarForTest(harness.db, war)).id;
      contestantIds = contestants.map((contestant) => contestant.id);
      const matchup = await harness.db.selectFrom('matchups').selectAll().where('war_id', '=', warId).executeTakeFirstOrThrow();
      await joinWarAsVoter(harness.db, warId, voterId);
      await joinWarAsVoter(harness.db, warId, otherVoterId);
      for (const [voter, winner] of [[voterId, matchup.contestant_a_id], [otherVoterId, matchup.contestant_b_id]] as const) {
        await harness.db
          .insertInto('votes')
          .values({ id: newId(), matchup_id: matchup.id, voter_id: voter, winner_id: winner, presented_left_id: matchup.contestant_a_id })
          .execute();
      }
      await recomputeContestantCounters(harness.db, warId);
    });

    When('the Admin bans the Voter', async () => {
      // Act
      await putBan(adminId, voterId, true);
    });

    Then("the Voter's votes and memberships are gone and the counters reflect only the remaining vote", async () => {
      // Assert
      const votes = await harness.db.selectFrom('votes').selectAll().execute();
      expect(votes.map((vote) => vote.voter_id)).toEqual([otherVoterId]);
      const memberships = await harness.db.selectFrom('war_memberships').selectAll().execute();
      expect(memberships.map((membership) => membership.voter_id)).toEqual([otherVoterId]);
      const contestants = await harness.db.selectFrom('contestants').selectAll().where('war_id', '=', warId).execute();
      const remainingWinnerId = votes[0]!.winner_id;
      for (const contestant of contestants) {
        expect(contestant.appearance_count).toBe(1);
        expect(contestant.win_count).toBe(contestant.id === remainingWinnerId ? 1 : 0);
      }
    });

    And("the other Voter's War, vote and membership remain", async () => {
      expect(await count('wars')).toBe(1);
      expect(await count('contestants')).toBe(contestantIds.length);
      expect(await count('votes')).toBe(1);
      expect(storedObjectCount()).toBeGreaterThan(0);
    });
  });

  Scenario('Banning revokes every refresh-token family of the Voter', ({ Given, When, Then }) => {
    let adminId: string;
    let voterId: string;

    Given('an Admin and a Voter who signed in twice', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      ({ voterId } = await signIn('two-sessions'));
      await signIn('two-sessions');
    });

    When('the Admin bans the Voter', async () => {
      // Act
      await putBan(adminId, voterId, true);
    });

    Then('every refresh token of the Voter is revoked', async () => {
      // Assert
      const tokens = await harness.db.selectFrom('refresh_tokens').selectAll().where('voter_id', '=', voterId).execute();
      expect(tokens).toHaveLength(2);
      expect(tokens.every((token) => token.revoked_at !== null)).toBe(true);
    });
  });

  async function makeBannedVoterWithDeletedWar(): Promise<{ adminId: string; voterId: string }> {
    const adminId = (await makeAdmin(harness.db, 'admin')).id;
    const voterId = (await makeVoter(harness.db, 'banned-voter')).id;
    await makeDraftWar(harness.db, voterId);
    await putBan(adminId, voterId, true);
    return { adminId, voterId };
  }

  async function nothingChangedAndNothingLogged(targetId: string, response: request.Response): Promise<void> {
    expect(response.status).toBe(403);
    const row = await harness.db.selectFrom('voters').select('banned_at').where('id', '=', targetId).executeTakeFirstOrThrow();
    expect(row.banned_at).toBeNull();
    expect(await count('wars')).toBe(1);
    expect(await logRows()).toHaveLength(0);
  }

  Scenario('Unbanning restores sign-in but not the deleted data', ({ Given, When, And, Then }) => {
    let adminId: string;
    let voterId: string;
    let callbackResponse: request.Response;

    Given('an Admin and a banned Voter whose War was deleted', async () => {
      // Arrange
      ({ adminId, voterId } = await makeBannedVoterWithDeletedWar());
    });

    When('the Admin unbans the Voter', async () => {
      // Act
      await putBan(adminId, voterId, false);
    });

    And('the Voter completes the OAuth callback again', async () => {
      callbackResponse = await callbackFor('banned-voter');
    });

    Then('the callback signs the Voter in and the War stays deleted and an unban_voter entry is logged', async () => {
      // Assert
      expect(callbackResponse.status).toBe(302);
      expect(extractCookieValue(callbackResponse.get('Set-Cookie'), 'refresh_token')).toBeTruthy();
      expect(await count('wars')).toBe(0);
      expect((await logRows()).map((row) => row.action)).toContain('unban_voter');
    });
  });

  Scenario('Banning an already-banned Voter is idempotent', ({ Given, When, Then }) => {
    let adminId: string;
    let voterId: string;
    let response: request.Response;

    Given('an Admin and a banned Voter whose War was deleted', async () => {
      // Arrange
      ({ adminId, voterId } = await makeBannedVoterWithDeletedWar());
    });

    When('the Admin bans the Voter', async () => {
      // Act
      response = await putBan(adminId, voterId, true);
    });

    Then('the response is 200 with the Voter banned and the log holds two ban_voter entries', async () => {
      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: voterId, suspended: false, banned: true });
      expect((await logRows()).filter((row) => row.action === 'ban_voter')).toHaveLength(2);
    });
  });

  Scenario('A plain Voter cannot ban', ({ Given, When, Then }) => {
    let callerId: string;
    let targetId: string;
    let response: request.Response;

    Given('two plain Voters with the second owning a War', async () => {
      // Arrange
      callerId = (await makeVoter(harness.db, 'caller')).id;
      targetId = (await makeVoter(harness.db, 'target')).id;
      await makeDraftWar(harness.db, targetId);
    });

    When('the first Voter bans the second', async () => {
      // Act
      response = await putBan(callerId, targetId, true);
    });

    Then('the response is 403 and nothing changed and nothing is logged', async () => {
      // Assert
      await nothingChangedAndNothingLogged(targetId, response);
    });
  });

  Scenario('Staff cannot ban themselves', ({ Given, When, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin who owns a War', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      await makeDraftWar(harness.db, adminId);
    });

    When('the Admin bans themself', async () => {
      // Act
      response = await putBan(adminId, adminId, true);
    });

    Then('the response is 403 and nothing changed and nothing is logged', async () => {
      // Assert
      await nothingChangedAndNothingLogged(adminId, response);
    });
  });

  Scenario('Staff cannot ban other Staff', ({ Given, When, Then }) => {
    let adminId: string;
    let moderatorId: string;
    let response: request.Response;

    Given('an Admin and a Moderator who owns a War', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      moderatorId = (await makeModerator(harness.db, 'moderator')).id;
      await makeDraftWar(harness.db, moderatorId);
    });

    When('the Admin bans the Moderator', async () => {
      // Act
      response = await putBan(adminId, moderatorId, true);
    });

    Then('the response is 403 and nothing changed and nothing is logged', async () => {
      // Assert
      await nothingChangedAndNothingLogged(moderatorId, response);
    });
  });

  Scenario('Banning an unknown Voter 404s', ({ Given, When, Then }) => {
    let adminId: string;
    let response: request.Response;

    Given('an Admin', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
    });

    When('the Admin bans an unknown Voter id', async () => {
      // Act
      response = await putBan(adminId, '00000000-0000-0000-0000-000000000000', true);
    });

    Then('the response is 404 and nothing is logged', async () => {
      // Assert
      expect(response.status).toBe(404);
      expect(await logRows()).toHaveLength(0);
    });
  });

  Scenario('A storage failure after the commit does not fail the ban', ({ Given, When, Then }) => {
    let adminId: string;
    let voterId: string;
    let response: request.Response;

    Given('an Admin and a Voter who owns a War with images and the object store is failing', async () => {
      // Arrange
      adminId = (await makeAdmin(harness.db, 'admin')).id;
      voterId = (await makeVoter(harness.db, 'voter')).id;
      await makeDraftWarWithContestants(harness.db, harness.storage, voterId, 2);
      harness.storage.deletePrefix = async () => {
        throw new Error('object store unavailable');
      };
    });

    When('the Admin bans the Voter', async () => {
      // Act
      response = await putBan(adminId, voterId, true);
    });

    Then('the response is 200 and the War rows are deleted and the Voter is banned', async () => {
      // Assert
      expect(response.status).toBe(200);
      expect(response.body.banned).toBe(true);
      expect(await count('wars')).toBe(0);
      expect(await count('contestants')).toBe(0);
    });
  });
});
