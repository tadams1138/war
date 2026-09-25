import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { findVoterById } from '../auth/votersRepository.js';

/** Admin-only gate (spec §6.7) — 403s unless `request.voterId`'s voter has `isAdmin`. Run after `requireAuth` so `voterId` is already populated. */
export function requireAdmin(db: Kysely<Database>) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const voter = await findVoterById(db, request.voterId!);
    if (!voter?.isAdmin) {
      await reply.code(403).send({ error: 'forbidden' });
    }
  };
}

/** Moderator-or-Admin gate (spec §8.5: "Moderator/Admin only") — 403s unless the voter has either flag. */
export function requireModeratorOrAdmin(db: Kysely<Database>) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const voter = await findVoterById(db, request.voterId!);
    if (!voter?.isModerator && !voter?.isAdmin) {
      await reply.code(403).send({ error: 'forbidden' });
    }
  };
}
