import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { bearerAuthRoute } from '../auth/plugin.js';
import type { AuthDependencies } from '../auth/authService.js';
import { requireModerator } from '../auth/guards.js';
import { reportSchemaViolations, rejectInvalidBody } from '../shared/bodyValidation.js';
import { errorResponseSchema, sendOutcome, validationErrorResponseSchema, failureResponses } from '../shared/httpOutcomes.js';
import {
  fileReport,
  listReportsForWar,
  markAddressed,
  presentReport,
  reportViewSchema,
  unaddressedQueue,
  unaddressedWarViewSchema,
} from './reportsService.js';

export interface ReportsRouteDeps {
  db: Kysely<Database>;
  auth: AuthDependencies;
}

export function registerReportsRoutes(app: FastifyInstance, deps: ReportsRouteDeps): void {
  const { db, auth } = deps;

  app.post<{ Params: { id: string }; Body: { explanation: string } }>(
    '/wars/:id/reports',
    {
      ...reportSchemaViolations,
      ...bearerAuthRoute(
        auth,
        {
          body: { type: 'object', required: ['explanation'], properties: { explanation: { type: 'string' } } },
          response: {
            201: reportViewSchema,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
        [rejectInvalidBody],
      ),
    },
    async (request, reply) => {
      const outcome = await fileReport(db, { warId: request.params.id, reporterId: request.voterId!, explanation: request.body.explanation });
      return sendOutcome(reply, outcome, (value) => reply.code(201).send(presentReport(value)));
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
          ...failureResponses,
        },
      },
      [requireModerator],
    ),
    async (request, reply) => {
      const outcome = await listReportsForWar(db, request.params.id);
      return sendOutcome(reply, outcome, (value) => reply.send({ reports: value.map(presentReport) }));
    },
  );

  app.get(
    '/reports/unaddressed',
    bearerAuthRoute(
      auth,
      {
        response: {
          200: { type: 'object', required: ['wars'], properties: { wars: { type: 'array', items: unaddressedWarViewSchema } } },
          403: errorResponseSchema,
        },
      },
      [requireModerator],
    ),
    async (_request, reply) => {
      const wars = await unaddressedQueue(db);
      return reply.send({ wars });
    },
  );

  app.patch<{ Params: { id: string }; Body: { addressed: true } }>(
    '/reports/:id',
    bearerAuthRoute(
      auth,
      {
        body: { type: 'object', required: ['addressed'], properties: { addressed: { type: 'boolean', const: true } } },
        response: { 200: reportViewSchema, ...failureResponses },
      },
      [requireModerator],
    ),
    async (request, reply) => {
      const outcome = await markAddressed(db, request.params.id);
      return sendOutcome(reply, outcome, (value) => reply.send(presentReport(value)));
    },
  );
}
