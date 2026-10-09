import { afterAll } from 'vitest';
import { closeAllApps } from './testApp.js';
import { closeTestDb } from './testDb.js';

// Apps are closed when the next harness is built (every Cucumber step is its own vitest test,
// so closing per test would pull the app out from under a scenario) and once more here.
afterAll(async () => {
  await closeAllApps();
  await closeTestDb();
});
