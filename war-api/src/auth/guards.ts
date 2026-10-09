import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { isKillSwitchEnabled } from '../killSwitch/killSwitchRepository.js';

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * A preHandler that replies `status` with `body` whenever `denies` is true. Guards run after authentication,
 * so `request.voter` is already loaded; none of them queries the Voter again.
 */
function guard(denies: (request: FastifyRequest) => boolean | Promise<boolean>, status: number, body: { error: string }): PreHandler {
  return async function preHandler(request, reply) {
    if (await denies(request)) {
      await reply.code(status).send(body);
    }
  };
}

const FORBIDDEN = { error: 'forbidden' };

/** Admin-only (§6.7). */
export const requireAdmin = guard((request) => !request.voter?.isAdmin, 403, FORBIDDEN);

/** Moderator-or-Admin only (§8.5). */
export const requireModeratorOrAdmin = guard((request) => !request.voter?.isModerator && !request.voter?.isAdmin, 403, FORBIDDEN);

/** The 403 body/schema `POST /wars` sends while the caller is suspended. */
export const suspendedResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string', enum: ['suspended'] } },
};

/** Refuses a suspended caller with 403 `suspended` (§6.7). */
export const rejectWhileSuspended = guard((request) => request.voter?.suspended === true, 403, { error: 'suspended' });

/** The 503 body/schema `POST /wars` sends while War creation is disabled. */
export const warCreationDisabledResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string', enum: ['war_creation_disabled'] } },
};

/** Refuses every caller, Staff included, with 503 while the kill switch is on. */
export function rejectWhileKillSwitchOn(db: Kysely<Database>): PreHandler {
  return guard(() => isKillSwitchEnabled(db), 503, { error: 'war_creation_disabled' });
}
