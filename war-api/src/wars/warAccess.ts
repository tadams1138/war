import type { FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { logAction } from '../moderation/moderationLogRepository.js';
import type { OwnerAction } from '../moderation/ownerActions.js';
import { findWarById, findWarIncludingRemoved, type War } from './warsRepository.js';

/** Who is acting: the roles that widen what they may do to a War (§3, §6.1). */
export interface Caller {
  voterId: string;
  isAdmin: boolean;
}

/** The roles that widen what a viewer may see of a War (§3, §6.1, §6.7). */
export interface ViewerRoles {
  isAdmin?: boolean;
  isModerator?: boolean;
}

/** The authenticated caller of a `bearerAuthRoute` handler. */
export function callerOf(request: FastifyRequest): Caller {
  return { voterId: request.voterId!, isAdmin: request.voter?.isAdmin === true };
}

export type OwnedWarOutcome = { kind: 'ok'; war: War; caller: Caller } | { kind: 'notFound' } | { kind: 'forbidden' };

/** Whether `caller` may manage `war` (§6.1): its creator, or any Admin. A removed War is editable by no one (§6.7). */
export function canManageWar(war: War, caller: { voterId?: string | null; isAdmin?: boolean }): boolean {
  return war.removedAt === null && (caller.isAdmin === true || (caller.voterId != null && war.creatorId === caller.voterId));
}

/**
 * Owner-level access, no status requirement: a War is always editable by its creator, in any status, and by any
 * Admin (§6.1). A Moderator-removed War is not found for anyone, as `findWarById` skips it.
 */
export async function loadOwnedWar(db: Kysely<Database>, warId: string, caller: Caller): Promise<OwnedWarOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (!canManageWar(war, caller)) return { kind: 'forbidden' };
  return { kind: 'ok', war, caller };
}

/**
 * Logs one owner-level request that succeeded (§6.7): only when an Admin acts on a War they did not create, since on
 * their own War an Admin is simply its creator.
 */
export async function recordOwnerAction(db: Kysely<Database>, guard: { war: War; caller: Caller }, action: OwnerAction): Promise<void> {
  const { war, caller } = guard;
  if (!caller.isAdmin || war.creatorId === caller.voterId) return;
  await logAction(db, { action, actorVoterId: caller.voterId, targetWarId: war.id });
}

/**
 * Whether the viewer may see this War at all (§6.1): a draft is invisible to everyone but its creator and Admins, and
 * routes report it as not found, never as "exists but private". A closed War stays visible.
 * Judged on the stored status, not the effective one: a draft whose end date passes reads as closed,
 * but it was never published, so expiry must not make it public. A Moderator sees every War (§6.7).
 */
export function isWarVisibleTo(war: War, voterId: string | undefined | null, roles: ViewerRoles = {}): boolean {
  return roles.isModerator === true || war.status !== 'draft' || canManageWar(war, { voterId, isAdmin: roles.isAdmin });
}

/**
 * The War, or `undefined` when it does not exist or the viewer may not see it. Only a Moderator can load a removed
 * War (§6.7); for everyone else it does not exist.
 */
export async function findVisibleWar(
  db: Kysely<Database>,
  warId: string,
  voterId: string | undefined | null,
  roles: ViewerRoles = {},
): Promise<War | undefined> {
  const war = roles.isModerator === true ? await findWarIncludingRemoved(db, warId) : await findWarById(db, warId);
  return war && isWarVisibleTo(war, voterId, roles) ? war : undefined;
}
