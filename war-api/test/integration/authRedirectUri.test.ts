import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildAppWithoutDb } from '../setup/testAppNoDb.js';

/**
 * Closes an observability gap: nothing else in the suite inspects the
 * `redirect_uri` that actually reaches Google (war-spec.md §5.1's exact-URL
 * requirement applies to the callback exchange too), only the computed
 * `redirectUri` one layer above the wire. Runs DB-free via
 * `buildAppWithoutDb()` -- `beginLogin` never touches the database, it only
 * generates state and calls `google.authorizationUrl`.
 */
describe('GET /api/v1/auth/google/login redirect_uri', () => {
  it('redirects to an authorization URL carrying the configured PUBLIC_BASE_URL-derived redirect_uri', async () => {
    // Arrange
    const harness = await buildAppWithoutDb();
    await harness.app.ready();

    // Act
    const response = await request(harness.app.server).get('/api/v1/auth/google/login');

    // Assert
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location: string | undefined = response.headers.location;
    expect(location).toBeTruthy();
    const redirectUri = new URL(location!).searchParams.get('redirect_uri');
    expect(redirectUri).toBe('https://api.test/api/v1/auth/google/callback');
  });
});
