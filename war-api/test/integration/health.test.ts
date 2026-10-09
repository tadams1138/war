import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { buildAppWithoutDb, type NoDbHarness } from '../setup/testAppNoDb.js';

/**
 * App Platform's health_check (platform/{env}.yaml in war-infra) polls this
 * path to decide whether a deployment is serving traffic yet. Not bound to
 * a .feature file — this is infra-facing behaviour, not a user-facing API
 * contract, but it still needs the same TDD discipline: nothing was
 * registered at this path until this test demanded it, and DO's deploys
 * failed outright (DeployContainerHealthChecksFailed) as a result.
 *
 * The app is built without a database: any attempt by the health route to
 * touch `db` throws, so a 200 proves it has no dependency on it.
 */
describe('GET /api/v1/health', () => {
  let harness: NoDbHarness;

  beforeEach(async () => {
    harness = await buildAppWithoutDb();
    await harness.app.ready();
  });

  it('responds 200 with no auth and no dependencies on the database or storage', async () => {
    // Arrange
    const agent = request(harness.app.server);

    // Act
    const response = await agent.get('/api/v1/health');

    // Assert
    expect(response.status).toBe(200);
  });
});
