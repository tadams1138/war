import { describe, expect, it, beforeEach } from 'vitest';
import { WarOAuthServerProvider } from '../../src/oauth/provider.js';
import { createAuthorizationCode } from '../../src/oauth/authorizationCodesRepository.js';
import { generateAuthorizationCode, hashAuthorizationCode } from '../../src/oauth/authorizationCodes.js';
import { FakeGoogleAuthProvider } from '../setup/fakeGoogleProvider.js';
import { makeVoter } from '../setup/fixtures.js';
import { getTestDb, truncateAll } from '../setup/testDb.js';

const API_BASE_URL = 'https://api.test';
const RESOURCE = `${API_BASE_URL}/api/v1/mcp`;
const CLIENT_ID = 'https://client.test/client-metadata.json';
const REDIRECT_URI = 'https://client.test/callback';

/**
 * Design review of 513ee16, Finding 7: `exchangeAuthorizationCode`'s
 * correctness depends entirely on `challengeForAuthorizationCode` having
 * already claimed the row (checking expiry and `used_at`) -- a call that,
 * per the SDK's own `token.js`, runs first only because
 * `skipLocalPkceValidation` is never set. `exchangeAuthorizationCode` itself
 * enforced none of that. This drives `WarOAuthServerProvider` directly,
 * bypassing the SDK's own orchestration entirely, to prove the provider
 * method is safe on its own rather than only as ordered by its caller today.
 */
describe('WarOAuthServerProvider.exchangeAuthorizationCode does not depend on its caller claiming the code first (design review Finding 7)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('refuses a stored code that was never claimed (challengeForAuthorizationCode never ran)', async () => {
    // Arrange: insert an authorization code row directly, exactly as
    // `authorize()` would have, but skip the claim step
    // `challengeForAuthorizationCode` performs in the ordinary flow.
    const db = await getTestDb();
    const voter = await makeVoter(db, 'unclaimed-code-voter');
    const codeValue = generateAuthorizationCode();
    await createAuthorizationCode(db, {
      voterId: voter.id,
      clientId: CLIENT_ID,
      codeHash: hashAuthorizationCode(codeValue),
      codeChallenge: 'irrelevant-for-this-test',
      redirectUri: REDIRECT_URI,
      resource: RESOURCE,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const provider = new WarOAuthServerProvider({
      db,
      google: new FakeGoogleAuthProvider(),
      jwt: { secret: 'test-secret', issuer: 'war-api' },
      apiBaseUrl: API_BASE_URL,
      googleOAuthRedirectUri: `${API_BASE_URL}/api/v1/oauth/google/callback`,
    });

    // Act & Assert: an unclaimed code must not mint tokens, regardless of
    // whether some future caller ever validates PKCE against it first.
    await expect(
      provider.exchangeAuthorizationCode(
        { client_id: CLIENT_ID, redirect_uris: [REDIRECT_URI] },
        codeValue,
        undefined,
        REDIRECT_URI,
        new URL(RESOURCE),
      ),
    ).rejects.toThrow();
  });
});
