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

/** Admin-only: granting and revoking roles (§6.7). Admin implies no Moderator capability. */
export const requireAdmin = guard((request) => !request.voter?.isAdmin, 403, FORBIDDEN);

/** Moderator-only: the moderation capabilities (§6.7, §8.5). Admin does not imply it. */
export const requireModerator = guard((request) => !request.voter?.isModerator, 403, FORBIDDEN);

/** Moderator-or-Admin: the Voters views (§6.7 "Visibility") and the moderation log, whose content is then filtered by role. */
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

/** Refuses every caller, role holders included, with 503 while the kill switch is on. */
export function rejectWhileKillSwitchOn(db: Kysely<Database>): PreHandler {
  return guard(() => isKillSwitchEnabled(db), 503, { error: 'war_creation_disabled' });
}
