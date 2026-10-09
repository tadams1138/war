import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { findWarById, type War } from './warsRepository.js';

export type OwnedWarOutcome = { kind: 'ok'; war: War } | { kind: 'notFound' } | { kind: 'forbidden' };

/** Ownership-only, no status requirement: a War is always editable by its creator, in any status (§6.1). */
export async function loadOwnedWar(db: Kysely<Database>, warId: string, voterId: string): Promise<OwnedWarOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (war.creatorId !== voterId) return { kind: 'forbidden' };
  return { kind: 'ok', war };
}

/**
 * Whether `voterId` may see this War at all (§6.1): a draft is invisible to everyone but its
 * creator, and routes report it as not found, never as "exists but private". A closed War stays visible.
 * Judged on the stored status, not the effective one: a draft whose end date passes reads as closed,
 * but it was never published, so expiry must not make it public.
 */
export function isWarVisibleTo(war: War, voterId: string | undefined | null): boolean {
  return war.status !== 'draft' || war.creatorId === voterId;
}

/** The War, or `undefined` when it does not exist or `voterId` may not see it. */
export async function findVisibleWar(db: Kysely<Database>, warId: string, voterId: string | undefined | null): Promise<War | undefined> {
  const war = await findWarById(db, warId);
  return war && isWarVisibleTo(war, voterId) ? war : undefined;
}
