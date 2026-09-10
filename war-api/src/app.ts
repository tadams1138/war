import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import expressBridge from '@fastify/express';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import packageJson from '../package.json' with { type: 'json' };
import type { Database } from './db/types.js';
import type { AuthDependencies } from './auth/authService.js';
import type { GoogleAuthProvider } from './auth/googleProvider.js';
import { registerAuthRoutes } from './auth/routes.js';
import type { ObjectStorage } from './contestants/storage.js';
import { registerContestantsRoutes } from './contestants/routes.js';
import { registerMatchupsRoutes } from './matchups/routes.js';
import { registerOpenApiPlugin } from './openapi/plugin.js';
import { registerOpenApiRoutes } from './openapi/routes.js';
import { registerSharedSchemas } from './openapi/schemas.js';
import { registerOAuthCallbackRoute } from './oauth/callbackRoute.js';
import { registerOAuthAsRoutes, registerOAuthDiscoveryRoutes } from './oauth/routes.js';
import { WarOAuthServerProvider } from './oauth/provider.js';
import { registerRankingsRoutes } from './rankings/routes.js';
import { registerWarsRoutes } from './wars/routes.js';
import type { AppConfig } from './config.js';

export interface AppDeps {
  db: Kysely<Database>;
  google: GoogleAuthProvider;
  storage: ObjectStorage;
  config: AppConfig;
  /**
   * Overrides the OAuth 2.1 authorization server's client resolution (spec
   * §4.3.3), defaulting to the real CIMD resolver when omitted. Exists so
   * tests can register a fixed test client without a real HTTPS fetch —
   * mirrors `google`/`storage` above, the app's other network-touching
   * dependencies that are already injected for the same reason.
   */
  oauthClientsStore?: OAuthRegisteredClientsStore;
}

const API_PREFIX = '/api/v1';
const API_TITLE = 'War API';

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cookie);
  await app.register(cors, { origin: deps.config.uiOrigins, credentials: true });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  // Registered before any route so its onRoute hook observes every one of
  // them, including those added inside nested, prefixed plugins below.
  await registerOpenApiPlugin(app, API_PREFIX, { title: API_TITLE, version: packageJson.version });
  registerSharedSchemas(app);

  // App Platform's health_check (platform/{env}.yaml in war-infra) polls
  // this exact path. No auth, no dependencies — a check that the process is
  // up and answering HTTP, nothing more.
  app.get(`${API_PREFIX}/health`, async () => ({ status: 'ok' }));

  // RFC 8414 / RFC 9728 discovery documents (spec §4.3.5) live at the fixed,
  // unprefixed `/.well-known/*` root both RFCs require — registered on the
  // top-level app, never inside the `${API_PREFIX}` block below.
  registerOAuthDiscoveryRoutes(app, deps.config.apiBaseUrl);

  const authDeps: AuthDependencies = {
    db: deps.db,
    google: deps.google,
    jwt: { secret: deps.config.jwtSecret, issuer: deps.config.jwtIssuer },
  };

  const oauthProvider = new WarOAuthServerProvider({
    db: deps.db,
    google: deps.google,
    jwt: authDeps.jwt,
    apiBaseUrl: deps.config.apiBaseUrl,
    googleOAuthRedirectUri: deps.config.google.oauthServerRedirectUri,
    clientsStore: deps.oauthClientsStore,
  });

  // The MCP SDK's `authorizationHandler`/`tokenHandler` are Express
  // middleware (spec §4.3.1); this bridges them into this same Fastify app
  // and process — no second deployment, no second origin. Registered, and
  // mounted, on the top-level `app` rather than the `${API_PREFIX}`-prefixed
  // `instance` below: `@fastify/express` only dispatches to Express for a
  // request whose *matched Fastify route* owns the dispatching hook, and an
  // Express-only path matches no Fastify route — so mounting it inside the
  // prefixed block 404s every time (confirmed empirically; see
  // `registerOAuthAsRoutes`'s own comment for the full mechanism).
  await app.register(expressBridge);
  registerOAuthAsRoutes(app, API_PREFIX, oauthProvider);

  await app.register(
    async (instance) => {
      registerOpenApiRoutes(instance);
      registerAuthRoutes(instance, authDeps, {
        uiOrigins: deps.config.uiOrigins,
        googleRedirectUri: deps.config.google.redirectUri,
      });
      registerOAuthCallbackRoute(instance, authDeps, {
        issuerUrl: deps.config.apiBaseUrl,
        googleOAuthRedirectUri: deps.config.google.oauthServerRedirectUri,
      });
      registerWarsRoutes(instance, {
        db: deps.db,
        auth: authDeps,
        publicBaseUrl: deps.config.s3.publicBaseUrl,
        internalTaskToken: deps.config.internalTaskToken,
      });
      registerContestantsRoutes(instance, {
        db: deps.db,
        auth: authDeps,
        storage: deps.storage,
        publicBaseUrl: deps.config.s3.publicBaseUrl,
      });
      registerMatchupsRoutes(instance, { db: deps.db, auth: authDeps, publicBaseUrl: deps.config.s3.publicBaseUrl });
      registerRankingsRoutes(instance, { db: deps.db, auth: authDeps, publicBaseUrl: deps.config.s3.publicBaseUrl });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
