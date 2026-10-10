import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { expect } from 'vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { hashRefreshToken } from '../../src/auth/refreshTokens.js';
import { findRefreshTokenByHash } from '../../src/auth/refreshTokensRepository.js';
import { findVoterById } from '../../src/auth/votersRepository.js';
import { beginLogin, loginAndCallback, postRefresh, profileFor, signInAs } from '../setup/authFlow.js';
import { buildTestHarness, type TestHarness } from '../setup/testApp.js';
import { truncateAll } from '../setup/testDb.js';
import { extractCookieValue, findSetCookie } from '../setup/cookies.js';
import { anonymous } from '../setup/apiClient.js';
import { countVoters } from '../setup/queries.js';

const feature = await loadFeature(fileURLToPath(new URL('../../specs/features/auth.feature', import.meta.url)));

describeFeature(feature, ({ Scenario, ScenarioOutline, BeforeEachScenario }) => {
  let harness: TestHarness;

  BeforeEachScenario(async () => {
    await truncateAll();
    harness = await buildTestHarness();
  });

  Scenario('New voter signs in with Google', ({ Given, When, Then, And }) => {
    let voterCountBefore: number;
    let jwt: string | undefined;
    let refreshTokenValue: string | undefined;

    Given('a user has never signed in before', async () => {
      // Arrange
      voterCountBefore = await countVoters(harness.db);
    });

    When('they authenticate via Google OAuth', async () => {
      // Act
      const { refreshTokenValue: token } = await loginAndCallback(harness, {
        providerUserId: 'new-voter@example.com',
        displayName: 'New Voter',
        avatarUrl: null,
      });
      refreshTokenValue = token;
      const refreshResponse = await postRefresh(harness, token);
      jwt = (refreshResponse.body as { token?: string }).token;
    });

    Then('a new Voter record is created', async () => {
      // Assert
      expect(await countVoters(harness.db)).toBe(voterCountBefore + 1);
    });

    And('a JWT and refresh token are returned', () => {
      // Assert
      expect(jwt).toBeTruthy();
      expect(refreshTokenValue).toBeTruthy();
    });
  });

  Scenario('Returning voter signs in', ({ Given, When, Then, And }) => {
    let firstVoterId: string;

    Given('a voter has previously signed in with Google', async () => {
      // Arrange
      const { refreshTokenValue } = await loginAndCallback(harness, {
        providerUserId: 'returning@example.com',
        displayName: 'Returning Voter',
        avatarUrl: null,
      });
      const refreshResponse = await postRefresh(harness, refreshTokenValue);
      const meResponse = await anonymous(harness).get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${(refreshResponse.body as { token: string }).token}` } });
      firstVoterId = (meResponse.body as { voter: { id: string } }).voter.id;
    });

    When('they authenticate again via Google OAuth', async () => {
      // Act
      await loginAndCallback(harness, {
        providerUserId: 'returning@example.com',
        displayName: 'Returning Voter',
        avatarUrl: null,
      });
    });

    Then('no new Voter record is created', async () => {
      // Assert
      expect(await countVoters(harness.db)).toBe(1);
    });

    And('the existing record is returned', async () => {
      // Assert
      const voter = await findVoterById(harness.db, firstVoterId);
      expect(voter).toBeDefined();
      expect(voter?.providerUserId).toBe('returning@example.com');
    });
  });

  ScenarioOutline('Accounts are keyed by provider and provider subject, never linked by email', ({ Given, When, Then, And }, variables) => {
    let voterAId: string;
    let voterBId: string;

    function signIn(provider: string, subject: string) {
      const providerId = provider.toLowerCase();
      const fake = providerId === 'microsoft' ? harness.microsoft : harness.google;
      return signInAs(harness, profileFor(subject), { provider: providerId, fake });
    }

    Given('voter A signed in with <first_provider> using "<first_subject>"', async () => {
      // Arrange
      voterAId = (await signIn(variables.first_provider as string, variables.first_subject as string)).voterId;
    });

    When('a user signs in with <second_provider> using "<second_subject>"', async () => {
      // Act
      voterBId = (await signIn(variables.second_provider as string, variables.second_subject as string)).voterId;
    });

    Then('a separate Voter record is created', async () => {
      // Assert
      expect(voterBId).not.toBe(voterAId);
      expect(await countVoters(harness.db)).toBe(2);
    });

    And('the two accounts are not linked', async () => {
      // Assert
      const rows = await harness.db.selectFrom('voters').select(['provider', 'provider_user_id']).execute();
      const identities = new Set(rows.map((row) => `${row.provider}:${row.provider_user_id}`));
      expect(identities.size).toBe(2);
    });
  });

  Scenario('Unauthenticated request to protected endpoint', ({ When, Then }) => {
    let response: request.Response;

    When('an unauthenticated caller calls GET /api/v1/auth/me', async () => {
      // Act
      await harness.app.ready();
      response = await anonymous(harness).get('/api/v1/auth/me');
    });

    Then('the response status is 401', () => {
      // Assert
      expect(response.status).toBe(401);
    });
  });

  Scenario('No token is placed in the redirect URL', ({ When, Then, And }) => {
    let callbackResponse: request.Response;

    When('a user completing OAuth with Google is redirected back to the SPA by the callback', async () => {
      // Act
      const result = await loginAndCallback(harness, {
        providerUserId: 'no-token-in-url@example.com',
        displayName: 'No Token',
        avatarUrl: null,
      });
      callbackResponse = result.callbackResponse;
    });

    Then('the redirect location contains no token in its path, query, or fragment', () => {
      // Assert
      expect(callbackResponse.status).toBeGreaterThanOrEqual(300);
      expect(callbackResponse.status).toBeLessThan(400);
      const location = callbackResponse.get('Location') ?? '';
      expect(location).not.toMatch(/token|jwt|refresh/i);
      expect(location).toBe('https://app.test/auth/callback');
    });

    And('the refresh token is set as an HttpOnly cookie', () => {
      // Assert
      const setCookie = findSetCookie(callbackResponse.get('Set-Cookie'), 'refresh_token');
      expect(setCookie).toBeDefined();
      expect(setCookie?.toLowerCase()).toContain('httponly');
    });
  });

  Scenario("A user declines Google's consent prompt", ({ Given, When, Then, And }) => {
    let stateCookie: string;
    let response: request.Response;

    Given('a user who began signing in with Google', async () => {
      // Arrange
      const begun = await beginLogin(harness);
      stateCookie = begun.stateCookie;
    });

    When("Google's callback reports \"access_denied\" instead of an authorization code", async () => {
      // Act
      response = await request(harness.app.server)
        .get('/api/v1/auth/google/callback')
        .query({ error: 'access_denied' })
        .set('Cookie', `oauth_state=${stateCookie}`);
    });

    Then('the response status is 403', () => {
      // Assert
      expect(response.status).toBe(403);
    });

    And('the reported reason is "access_denied"', () => {
      // Assert
      // Pins both halves of the callback failure body:
      // "error" is the fixed contract string, "reason" is the provider's
      // code passed through verbatim.
      expect((response.body as { error?: string; reason?: string }).error).toBe('authorization declined');
      expect((response.body as { error?: string; reason?: string }).reason).toBe('access_denied');
    });

    And('no refresh token cookie is set', () => {
      // Assert
      expect(extractCookieValue(response.get('Set-Cookie'), 'refresh_token')).toBeUndefined();
    });
  });

  Scenario('The SPA obtains its first JWT by exchanging the cookie', ({ Given, When, Then }) => {
    let refreshTokenValue: string;
    let refreshResponse: request.Response;

    Given('a refresh cookie set by a completed OAuth callback', async () => {
      // Arrange
      const result = await loginAndCallback(harness, {
        providerUserId: 'spa-exchange@example.com',
        displayName: 'SPA User',
        avatarUrl: null,
      });
      refreshTokenValue = result.refreshTokenValue;
    });

    When('the SPA POSTs to /api/v1/auth/refresh', async () => {
      // Act
      refreshResponse = await postRefresh(harness, refreshTokenValue);
    });

    Then('a JWT is returned in the response body', () => {
      // Assert
      expect(refreshResponse.status).toBe(200);
      expect((refreshResponse.body as { token?: string }).token).toBeTruthy();
    });
  });

  Scenario('Refresh rotates the token', ({ Given, When, Then, And }) => {
    let originalToken: string;
    let refreshResponse: request.Response;

    Given('a valid refresh token', async () => {
      // Arrange
      const result = await loginAndCallback(harness, {
        providerUserId: 'rotate@example.com',
        displayName: 'Rotate User',
        avatarUrl: null,
      });
      originalToken = result.refreshTokenValue;
    });

    When('it is exchanged at /auth/refresh', async () => {
      // Act
      refreshResponse = await postRefresh(harness, originalToken);
    });

    Then('a new refresh token is issued', () => {
      // Assert
      const newToken = extractCookieValue(refreshResponse.get('Set-Cookie'), 'refresh_token');
      expect(newToken).toBeTruthy();
      expect(newToken).not.toBe(originalToken);
    });

    And('the presented token is marked used', async () => {
      // Assert
      const stored = await findRefreshTokenByHash(harness.db, hashRefreshToken(originalToken));
      expect(stored?.usedAt).not.toBeNull();
    });
  });

  Scenario('Reusing a rotated refresh token revokes the family', ({ Given, When, Then, And }) => {
    let usedToken: string;
    let successorToken: string;
    let familyId: string;
    let reuseResponse: request.Response;

    Given('a refresh token that has already been exchanged once', async () => {
      // Arrange
      const result = await loginAndCallback(harness, {
        providerUserId: 'reuse@example.com',
        displayName: 'Reuse User',
        avatarUrl: null,
      });
      usedToken = result.refreshTokenValue;
      const stored = await findRefreshTokenByHash(harness.db, hashRefreshToken(usedToken));
      familyId = stored!.familyId;
      const rotateResponse = await postRefresh(harness, usedToken); // rotate it once
      successorToken = extractCookieValue(rotateResponse.get('Set-Cookie'), 'refresh_token')!;
    });

    When('it is presented again', async () => {
      // Act
      reuseResponse = await postRefresh(harness, usedToken);
    });

    Then('the response status is 401', () => {
      // Assert
      expect(reuseResponse.status).toBe(401);
    });

    And('every token in its family is revoked', async () => {
      // Assert
      const rows = await harness.db.selectFrom('refresh_tokens').selectAll().where('family_id', '=', familyId).execute();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.revoked_at !== null)).toBe(true);
    });

    And('the voter must re-authenticate', async () => {
      // Assert
      const rotatedRows = await harness.db
        .selectFrom('refresh_tokens')
        .selectAll()
        .where('family_id', '=', familyId)
        .where('used_at', 'is', null)
        .execute();
      // The latest (rotated) token in the family is revoked too, so no
      // further refresh in this family can succeed without a fresh login.
      expect(rotatedRows.every((row) => row.revoked_at !== null)).toBe(true);

      // "Must re-authenticate" means a client asking the API is turned away
      // — not merely that a row is present in the table. Presenting the
      // still-valid-looking successor token now fails.
      const successorRefreshAttempt = await postRefresh(harness, successorToken);
      expect(successorRefreshAttempt.status).toBe(401);
    });
  });

  Scenario('Refresh rejects a cross-origin caller', ({ Given, When, Then }) => {
    let refreshTokenValue: string;
    let response: request.Response;

    Given('a valid refresh cookie', async () => {
      // Arrange
      const result = await loginAndCallback(harness, {
        providerUserId: 'cross-origin@example.com',
        displayName: 'Cross Origin',
        avatarUrl: null,
      });
      refreshTokenValue = result.refreshTokenValue;
    });

    When('/auth/refresh is called with an unregistered Origin header', async () => {
      // Act
      response = await postRefresh(harness, refreshTokenValue, 'https://evil.test');
    });

    Then('the response status is 403', () => {
      // Assert
      expect(response.status).toBe(403);
    });
  });

  Scenario('Logout revokes the whole family', ({ Given, When, Then, And }) => {
    let refreshTokenValue: string;
    let jwt: string;
    let familyId: string;

    Given('an authenticated voter', async () => {
      // Arrange
      const result = await loginAndCallback(harness, {
        providerUserId: 'logout@example.com',
        displayName: 'Logout User',
        avatarUrl: null,
      });
      refreshTokenValue = result.refreshTokenValue;
      const stored = await findRefreshTokenByHash(harness.db, hashRefreshToken(refreshTokenValue));
      familyId = stored!.familyId;
      const refreshResponse = await postRefresh(harness, refreshTokenValue);
      refreshTokenValue = extractCookieValue(refreshResponse.get('Set-Cookie'), 'refresh_token')!;
      jwt = (refreshResponse.body as { token: string }).token;
    });

    When('they call DELETE /auth/session', async () => {
      // Act
      await harness.app.ready();
      await request(harness.app.server)
        .delete('/api/v1/auth/session')
        .set('Authorization', `Bearer ${jwt}`)
        .set('Cookie', `refresh_token=${refreshTokenValue}`);
    });

    Then('their refresh token family is revoked', async () => {
      // Assert
      const rows = await harness.db.selectFrom('refresh_tokens').selectAll().where('family_id', '=', familyId).execute();
      expect(rows.every((row) => row.revoked_at !== null)).toBe(true);
    });

    And('a subsequent refresh returns 401', async () => {
      // Assert
      const response = await postRefresh(harness, refreshTokenValue);
      expect(response.status).toBe(401);
    });
  });
});
