import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import packageJson from '../package.json' with { type: 'json' };
import type { Database } from './db/types.js';
import type { AuthDependencies } from './auth/authService.js';
import type { OAuthProvider } from './auth/oauthProvider.js';
import { registerAuthRoutes } from './auth/routes.js';
import type { ObjectStorage } from './contestants/storage.js';
import { registerContestantsRoutes } from './contestants/routes.js';
import { registerMatchupsRoutes } from './matchups/routes.js';
import { registerOpenApiPlugin } from './openapi/plugin.js';
import { registerOpenApiRoutes } from './openapi/routes.js';
import { registerSharedSchemas } from './openapi/schemas.js';
import { registerRankingsRoutes } from './rankings/routes.js';
import { registerReportsRoutes } from './reports/routes.js';
import { registerAdminRoutes } from './admin/routes.js';
import { registerModerationLogRoutes } from './moderation/routes.js';
import { registerKillSwitchRoutes } from './killSwitch/routes.js';
import { registerRolesRoutes } from './roles/routes.js';
import { registerVoterModerationRoutes } from './voterModeration/routes.js';
import { registerWarsRoutes } from './wars/routes.js';
import type { AppConfig } from './config.js';
import { MAX_UPLOAD_BYTES } from './contestants/imageProcessing.js';
import { redactedRequestSerializer } from './logging.js';
import { RateLimiter } from './shared/rateLimit.js';

export interface AppDeps {
  db: Kysely<Database>;
  providers: ReadonlyMap<string, OAuthProvider>;
  storage: ObjectStorage;
  config: AppConfig;
}

const API_PREFIX = '/api/v1';
const API_TITLE = 'War API';

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  // Request/response logging to stdout, which App Platform's Runtime Logs capture. `req`'s url is redacted
  // because the auth callback's query string carries a provider's one-time OAuth code/state.
  // `trustProxy` is the reverse-proxy hop count (config.trustProxyHops): it decides which
  // `X-Forwarded-For` entry `request.ip` reports, which the address-keyed rate limits rely on.
  const app = Fastify({
    logger: { level: 'info', serializers: { req: redactedRequestSerializer } },
    trustProxy: deps.config.trustProxyHops ?? 0,
  });

  await app.register(cookie);
  await app.register(cors, { origin: deps.config.uiOrigins, credentials: true });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
  // Registered before any route so its onRoute hook observes every one of
  // them, including those added inside nested, prefixed plugins below.
  await registerOpenApiPlugin(app, API_PREFIX, { title: API_TITLE, version: packageJson.version });
  registerSharedSchemas(app);

  // App Platform's health_check (platform/{env}.yaml in war-infra) polls
  // this exact path. No auth, no dependencies — a check that the process is
  // up and answering HTTP, nothing more.
  app.get(`${API_PREFIX}/health`, async () => ({ status: 'ok' }));

  const authDeps: AuthDependencies = {
    db: deps.db,
    providers: deps.providers,
    jwt: { secret: deps.config.jwtSecret, issuer: deps.config.jwtIssuer },
  };

  // Per-voter rate limits (§8.4) -- one limiter instance per scope, per
  // app instance, so each `buildApp()` call (a fresh process in production,
  // a fresh test harness in `buildTestHarness`) starts with clean state.
  const voteRateLimiter = new RateLimiter([
    { windowMs: 60_000, max: 60 },
    { windowMs: 86_400_000, max: 2000 },
  ]);
  const warCreationRateLimiter = new RateLimiter([{ windowMs: 3_600_000, max: 10 }]);
  const imageUploadRateLimiter = new RateLimiter([{ windowMs: 3_600_000, max: 100 }]);
  // Per-client-address limits for the endpoints that run before a voter is identified (§8.4).
  // Off until the proxy hop count is configured: without it every client shares one address.
  const addressLimited = deps.config.trustProxyHops !== undefined;
  const signInRateLimiter = addressLimited ? new RateLimiter([{ windowMs: 60_000, max: 10 }]) : undefined;
  const tokenRefreshRateLimiter = addressLimited ? new RateLimiter([{ windowMs: 60_000, max: 30 }]) : undefined;

  await app.register(
    async (instance) => {
      registerOpenApiRoutes(instance);
      registerAuthRoutes(instance, authDeps, {
        uiOrigins: deps.config.uiOrigins,
        apiBaseUrl: deps.config.apiBaseUrl,
        signInRateLimiter,
        tokenRefreshRateLimiter,
      });
      registerWarsRoutes(instance, {
        db: deps.db,
        auth: authDeps,
        storage: deps.storage,
        publicBaseUrl: deps.config.s3.publicBaseUrl,
        internalTaskToken: deps.config.internalTaskToken,
        rateLimiter: warCreationRateLimiter,
        imageUploadRateLimiter,
      });
      registerContestantsRoutes(instance, {
        db: deps.db,
        auth: authDeps,
        storage: deps.storage,
        publicBaseUrl: deps.config.s3.publicBaseUrl,
        rateLimiter: imageUploadRateLimiter,
      });
      registerMatchupsRoutes(instance, {
        db: deps.db,
        auth: authDeps,
        publicBaseUrl: deps.config.s3.publicBaseUrl,
        rateLimiter: voteRateLimiter,
      });
      registerRankingsRoutes(instance, { db: deps.db, auth: authDeps, publicBaseUrl: deps.config.s3.publicBaseUrl });
      registerReportsRoutes(instance, { db: deps.db, auth: authDeps });
      registerRolesRoutes(instance, { db: deps.db, auth: authDeps });
      registerModerationLogRoutes(instance, { db: deps.db, auth: authDeps });
      registerKillSwitchRoutes(instance, { db: deps.db, auth: authDeps });
      registerVoterModerationRoutes(instance, { db: deps.db, auth: authDeps, storage: deps.storage });
      registerAdminRoutes(instance, { db: deps.db, auth: authDeps });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
