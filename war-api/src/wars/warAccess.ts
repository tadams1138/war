import type { FastifyRequest } from 'fastify';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/types.js';
import { logAction } from '../moderation/moderationLogRepository.js';
import type { OwnerAction } from '../moderation/ownerActions.js';
import type { MutationFailure, MutationOutcome } from '../shared/outcomes.js';
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
export async function loadOwnedWar(db: Kysely<Database> | Transaction<Database>, warId: string, caller: Caller): Promise<OwnedWarOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (!canManageWar(war, caller)) return { kind: 'forbidden' };
  return { kind: 'ok', war, caller };
}

/** Thrown inside the transaction of `asOwnerAction` to roll it back while carrying the refusal out to the caller. */
class OwnerActionRefused<R> extends Error {
  constructor(readonly outcome: R) {
    super('owner action refused');
  }
}

/**
 * Logs one owner-level request that succeeded (§6.7): only when an Admin acts on a War they did not create, since on
 * their own War an Admin is simply its creator.
 */
async function logOwnerAction(trx: Transaction<Database>, war: War, caller: Caller, action: OwnerAction): Promise<void> {
  if (!caller.isAdmin || war.creatorId === caller.voterId) return;
  await logAction(trx, { action, actorVoterId: caller.voterId, targetWarId: war.id });
}

/**
 * The one unit of work for an owner-level change (§6.1, §6.7): guards access, runs `work` and, when an Admin acts on
 * another Voter's War, writes its moderation log entry, all in one transaction, so the change and its entry stand or
 * fall together. `work` must use `trx`, and any refusal it returns (not `ok`) rolls the transaction back and is
 * returned as is, logging nothing. Keep slow work (object storage) outside `work`.
 */
export async function asOwnerAction<T>(
  db: Kysely<Database>,
  warId: string,
  caller: Caller,
  action: OwnerAction,
  work: (trx: Transaction<Database>, war: War) => Promise<MutationOutcome<T>>,
): Promise<MutationOutcome<T>> {
  try {
    return await db.transaction().execute(async (trx) => {
      const guard = await loadOwnedWar(trx, warId, caller);
      if (guard.kind !== 'ok') return guard;
      const outcome = await work(trx, guard.war);
      if (outcome.kind !== 'ok') throw new OwnerActionRefused(outcome);
      await logOwnerAction(trx, guard.war, caller, action);
      return outcome;
    });
  } catch (error) {
    if (error instanceof OwnerActionRefused) return error.outcome as MutationFailure;
    throw error;
  }
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
