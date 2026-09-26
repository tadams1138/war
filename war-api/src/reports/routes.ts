import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { requireModeratorOrAdmin } from '../roles/rolesAccess.js';
import { errorResponseSchema, replyForOutcome, validationErrorResponseSchema } from '../shared/httpOutcomes.js';
import { fileReport, listReportsForWarOutcome, presentReport, reportViewSchema } from './reportsService.js';

export interface ReportsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

export function registerReportsRoutes(app: FastifyInstance, deps: ReportsRouteDeps): void {
  const { db, auth } = deps;

  app.post<{ Params: { id: string } }>(
    '/wars/:id/reports',
    bearerAuthRoute(auth, {
      body: { type: 'object', properties: { explanation: { type: 'string' } } },
      response: {
        201: reportViewSchema,
        404: errorResponseSchema,
        422: validationErrorResponseSchema,
      },
    }),
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const outcome = await fileReport(db, { warId: request.params.id, reporterId: request.voterId!, explanation: body.explanation });
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.code(201).send(presentReport(outcome.value));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/wars/:id/reports',
    bearerAuthRoute(
      auth,
      {
        response: {
          200: {
            type: 'object',
            required: ['reports'],
            properties: { reports: { type: 'array', items: reportViewSchema } },
          },
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      [requireModeratorOrAdmin(db)],
    ),
    async (request, reply) => {
      const outcome = await listReportsForWarOutcome(db, request.params.id);
      if (outcome.kind !== 'ok') {
        return replyForOutcome(reply, outcome);
      }
      return reply.send({ reports: outcome.value.map(presentReport) });
    },
  );
}
