import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';
import { REFRESH_TOKEN_TTL_MS, type StoredRefreshToken } from './refreshTokens.js';

function toStored(row: {
  id: string;
  voter_id: string;
  family_id: string;
  token_hash: string;
  expires_at: Date | string;
  used_at: Date | string | null;
  revoked_at: Date | string | null;
}): StoredRefreshToken {
  return {
    id: row.id,
    voterId: row.voter_id,
    familyId: row.family_id,
    tokenHash: row.token_hash,
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
}

export async function findRefreshTokenByHash(
  db: Kysely<Database>,
  tokenHash: string,
): Promise<StoredRefreshToken | undefined> {
  const row = await db
    .selectFrom('refresh_tokens')
    .selectAll()
    .where('token_hash', '=', tokenHash)
    .executeTakeFirst();
  return row ? toStored(row) : undefined;
}

/** Starts a new refresh-token family — one per login session. */
export async function createRefreshTokenFamily(
  db: Kysely<Database>,
  voterId: string,
  tokenHash: string,
): Promise<StoredRefreshToken> {
  const row = await db
    .insertInto('refresh_tokens')
    .values({
      id: newId(),
      voter_id: voterId,
      family_id: newId(),
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toStored(row);
}

export type RotateResult = { kind: 'rotated'; token: StoredRefreshToken } | { kind: 'lostRace' };

/**
 * Marks a token used and inserts its rotated successor, same family. The marking UPDATE is conditional on
 * the token still being unused and unrevoked, and its affected-row count decides the winner: a call that
 * loses a concurrent rotation of the same token must not also mint a successor, or reuse detection could
 * never trigger.
 */
export async function rotateRefreshToken(
  db: Kysely<Database>,
  used: StoredRefreshToken,
  newTokenHash: string,
): Promise<RotateResult> {
  return db.transaction().execute(async (trx) => {
    const claimed = await trx
      .updateTable('refresh_tokens')
      .set({ used_at: new Date() })
      .where('id', '=', used.id)
      .where('used_at', 'is', null)
      .where('revoked_at', 'is', null)
      .returning('id')
      .execute();

    if (claimed.length === 0) {
      return { kind: 'lostRace' };
    }

    const row = await trx
      .insertInto('refresh_tokens')
      .values({
        id: newId(),
        voter_id: used.voterId,
        family_id: used.familyId,
        token_hash: newTokenHash,
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { kind: 'rotated', token: toStored(row) };
  });
}

/** Revokes every token in a family immediately (reuse detection, logout). */
export async function revokeFamily(db: Kysely<Database>, familyId: string): Promise<void> {
  await db
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date() })
    .where('family_id', '=', familyId)
    .where('revoked_at', 'is', null)
    .execute();
}

/** Revokes every not-yet-revoked refresh token of a Voter, across all their families (§6.7: a ban ends every session). */
export async function revokeAllForVoter(db: Kysely<Database>, voterId: string): Promise<void> {
  await db
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date() })
    .where('voter_id', '=', voterId)
    .where('revoked_at', 'is', null)
    .execute();
}
