import type { FastifyInstance } from 'fastify';
import type { AdminRouteDeps } from './adminRouteShared.js';
import { registerAdminVotersRoutes } from './adminVotersRoutes.js';
import { registerAdminVotesRoutes } from './adminVotesRoutes.js';
import { registerAdminWarsRoutes } from './adminWarsRoutes.js';

/** Staff-only, read-only views (§6.7 "Visibility") — nothing here mutates anything or writes the moderation log. */
export function registerAdminRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  registerAdminWarsRoutes(app, deps);
  registerAdminVotersRoutes(app, deps);
  registerAdminVotesRoutes(app, deps);
}
