import type { Kysely } from 'kysely';
import { buildApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config.js';
import { signAccessToken } from '../../src/auth/jwt.js';
import type { Database } from '../../src/db/types.js';
import type { OAuthProvider } from '../../src/auth/oauthProvider.js';
import { FakeOAuthProvider } from './fakeOAuthProvider.js';
import { InMemoryObjectStorage } from './fakeStorage.js';
import { getTestDb } from './testDb.js';
import { INTERNAL_TOKEN } from './apiClient.js';

export function testConfig(): AppConfig {
  return loadConfig({
    UI_ORIGINS: 'https://app.test',
    JWT_SECRET: 'test-jwt-secret',
    INTERNAL_TASK_TOKEN: INTERNAL_TOKEN,
    S3_PUBLIC_BASE_URL: 'https://cdn.test',
    PUBLIC_BASE_URL: 'https://api.test',
    // One trusted hop, so tests can stand in for distinct client addresses with X-Forwarded-For.
    TRUST_PROXY_HOPS: '1',
  } as NodeJS.ProcessEnv);
}

export interface CommonAppDeps {
  config: AppConfig;
  google: FakeOAuthProvider;
  microsoft: FakeOAuthProvider;
  facebook: FakeOAuthProvider;
  twitter: FakeOAuthProvider;
  providers: ReadonlyMap<string, OAuthProvider>;
  storage: InMemoryObjectStorage;
}

/**
 * The dependencies every test harness wires the same way, regardless of
 * whether it backs `db` with a real database or a stub. Shared here so
 * `buildTestHarness` and `buildAppWithoutDb` (test/setup/testAppWithoutDb.ts)
 * cannot drift in how they construct `providers`/`storage`/`config`.
 */
export function buildCommonDeps(): CommonAppDeps {
  const config = testConfig();
  const google = new FakeOAuthProvider('google');
  const microsoft = new FakeOAuthProvider('microsoft');
  const facebook = new FakeOAuthProvider('facebook');
  const twitter = new FakeOAuthProvider('twitter');
  return {
    config,
    google,
    microsoft,
    facebook,
    twitter,
    providers: new Map<string, OAuthProvider>([
      ['google', google],
      ['microsoft', microsoft],
      ['facebook', facebook],
      ['twitter', twitter],
    ]),
    storage: new InMemoryObjectStorage(config.s3.publicBaseUrl),
  };
}

type App = Awaited<ReturnType<typeof buildApp>>;

const openApps = new Set<App>();

/** Registers an app so `closeAllApps` closes it. */
export function trackApp(app: App): App {
  openApps.add(app);
  return app;
}

export async function closeAllApps(): Promise<void> {
  const apps = [...openApps];
  openApps.clear();
  await Promise.all(apps.map((app) => app.close()));
}

export interface TestHarness {
  app: App;
  db: Kysely<Database>;
  google: FakeOAuthProvider;
  microsoft: FakeOAuthProvider;
  providers: ReadonlyMap<string, OAuthProvider>;
  storage: InMemoryObjectStorage;
  jwtFor: (voterId: string) => Promise<string>;
}

export async function buildTestHarness(): Promise<TestHarness> {
  await closeAllApps();
  const db = await getTestDb();
  const { config, google, microsoft, providers, storage } = buildCommonDeps();

  const app = trackApp(await buildApp({ db, providers, storage, config }));

  return {
    app,
    db,
    google,
    microsoft,
    providers,
    storage,
    jwtFor: (voterId: string) => signAccessToken(voterId, { secret: config.jwtSecret, issuer: config.jwtIssuer }),
  };
}
