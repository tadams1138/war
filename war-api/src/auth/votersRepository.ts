import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';
import type { OAuthProfile } from './oauthProvider.js';

export interface Voter {
  id: string;
  provider: string;
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
  isModerator: boolean;
  isAdmin: boolean;
}

function toVoter(row: {
  id: string;
  provider: string;
  provider_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_moderator: boolean;
  is_admin: boolean;
}): Voter {
  return {
    id: row.id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isModerator: row.is_moderator,
    isAdmin: row.is_admin,
  };
}

/**
 * Finds the voter for a (provider, provider_user_id) pair, creating one if
 * this is the first login. Two different provider_user_ids always produce
 * two different voters — there is no cross-account merge (spec).
 */
export async function findOrCreateVoter(
  db: Kysely<Database>,
  provider: string,
  profile: OAuthProfile,
): Promise<{ voter: Voter; created: boolean }> {
  const existing = await db
    .selectFrom('voters')
    .selectAll()
    .where('provider', '=', provider)
    .where('provider_user_id', '=', profile.providerUserId)
    .executeTakeFirst();

  if (existing) {
    return { voter: toVoter(existing), created: false };
  }

  const inserted = await db
    .insertInto('voters')
    .values({
      id: newId(),
      provider,
      provider_user_id: profile.providerUserId,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { voter: toVoter(inserted), created: true };
}

export async function findVoterById(db: Kysely<Database>, id: string): Promise<Voter | undefined> {
  const row = await db.selectFrom('voters').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? toVoter(row) : undefined;
}

/** Grants or revokes `role` on `voterId` (spec §6.7) — the only mutator of either role column. Returns `undefined` if no such voter exists, for callers to 404. */
export async function setVoterRole(
  db: Kysely<Database>,
  voterId: string,
  role: 'moderator' | 'admin',
  granted: boolean,
): Promise<Voter | undefined> {
  const values = role === 'admin' ? { is_admin: granted } : { is_moderator: granted };
  const row = await db.updateTable('voters').set(values).where('id', '=', voterId).returningAll().executeTakeFirst();
  return row ? toVoter(row) : undefined;
}
