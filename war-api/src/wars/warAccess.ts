import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { effectiveStatus } from './effectiveStatus.js';
import { findWarById, type War } from './warsRepository.js';

export type WarAccessOutcome = { kind: 'ok'; war: War } | { kind: 'notFound' } | { kind: 'forbidden' } | { kind: 'wrongStatus' };

/**
 * Loads a War, 404s if missing, 403s if the voter isn't its creator, and
 * checks its effective status against `expectedStatus` — the guard that used
 * to be written out independently at every mutation call site, discarding
 * the War it had just loaded and forcing callers to re-fetch it (design
 * review finding 5). Returns the loaded War so callers never need to.
 */
export async function loadWarOwnedBy(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  now: Date,
  expectedStatus: string,
): Promise<WarAccessOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (war.creatorId !== voterId) return { kind: 'forbidden' };
  if (effectiveStatus(war, now) !== expectedStatus) return { kind: 'wrongStatus' };
  return { kind: 'ok', war };
}

export type OwnedWarOutcome = { kind: 'ok'; war: War } | { kind: 'notFound' } | { kind: 'forbidden' };

/**
 * Ownership-only, no status requirement (war-spec.md §6.1: "A War is always
 * editable by its creator, in any status"). The common guard for every
 * mutation none of which is status-gated -- Publish/Unpublish, patching
 * metadata, adding/removing contestants, setting the share image, deleting,
 * and clearing votes.
 */
export async function loadOwnedWar(db: Kysely<Database>, warId: string, voterId: string, _now: Date): Promise<OwnedWarOutcome> {
  const war = await findWarById(db, warId);
  if (!war) return { kind: 'notFound' };
  if (war.creatorId !== voterId) return { kind: 'forbidden' };
  return { kind: 'ok', war };
}

/**
 * Whether `voterId` may see this War at all (spec §6.1: "A War not currently
 * published is invisible to everyone but its creator... its detail,
 * rankings, and vote pages report it as not found"). Shared by every
 * anonymous-or-authenticated read route that must 404 identically for a
 * missing War and a private one, never leaking a distinct "exists but is
 * private" signal.
 *
 * Gated on `draft` specifically, not "not published": spec §6.1's own
 * wording -- "exactly like a War that has never been published" -- and §4's
 * "Closing ends voting for good; rankings remain readable" both make clear
 * this invisibility is what the Publish/Unpublish toggle controls, and a
 * closed War (which *was* published) stays visible to everyone, matching
 * the existing War-expiry acceptance coverage (anonymous `GET /wars/:id` on
 * an expired War still succeeds, reporting `status: "closed"`).
 */
export function isWarVisibleTo(war: War, now: Date, voterId: string | undefined | null): boolean {
  return effectiveStatus(war, now) !== 'draft' || war.creatorId === voterId;
}
