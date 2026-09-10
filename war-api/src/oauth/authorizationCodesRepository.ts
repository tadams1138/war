import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newId } from '../db/uuid.js';

export interface StoredAuthorizationCode {
  id: string;
  voterId: string;
  clientId: string;
  codeHash: string;
  codeChallenge: string;
  redirectUri: string;
  resource: string;
  expiresAt: Date;
  usedAt: Date | null;
}

function toStored(row: {
  id: string;
  voter_id: string;
  client_id: string;
  code_hash: string;
  code_challenge: string;
  redirect_uri: string;
  resource: string;
  expires_at: Date | string;
  used_at: Date | string | null;
}): StoredAuthorizationCode {
  return {
    id: row.id,
    voterId: row.voter_id,
    clientId: row.client_id,
    codeHash: row.code_hash,
    codeChallenge: row.code_challenge,
    redirectUri: row.redirect_uri,
    resource: row.resource,
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : null,
  };
}

export interface NewAuthorizationCode {
  voterId: string;
  clientId: string;
  codeHash: string;
  codeChallenge: string;
  redirectUri: string;
  resource: string;
  expiresAt: Date;
}

/** Stores a freshly issued authorization code (spec §4.3.2, §6). */
export async function createAuthorizationCode(db: Kysely<Database>, params: NewAuthorizationCode): Promise<StoredAuthorizationCode> {
  const row = await db
    .insertInto('authorization_codes')
    .values({
      id: newId(),
      voter_id: params.voterId,
      client_id: params.clientId,
      code_hash: params.codeHash,
      code_challenge: params.codeChallenge,
      redirect_uri: params.redirectUri,
      resource: params.resource,
      expires_at: params.expiresAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toStored(row);
}

/**
 * Marks a code used and returns its stored fields, or `undefined` if no
 * unused, unexpired code with this hash exists (spec §4.3.4: "unknown,
 * expired, or already used"). The UPDATE's own `WHERE used_at IS NULL`
 * clause is the arbiter for concurrent claims — mirroring
 * `rotateRefreshToken`'s reasoning (`auth/refreshTokensRepository.ts`): the
 * database, not application code, decides which of two racing requests
 * claims the code, so at most one ever succeeds.
 *
 * Marks used on this call alone — spec §6's "used_at ... set on any
 * redemption attempt, success or not" is satisfied because this is called
 * once per token request, before PKCE is verified (§4.3.4's provider wires
 * this into `challengeForAuthorizationCode`, the first call in the exchange).
 */
export async function claimAuthorizationCode(db: Kysely<Database>, codeHash: string): Promise<StoredAuthorizationCode | undefined> {
  const row = await db
    .updateTable('authorization_codes')
    .set({ used_at: new Date() })
    .where('code_hash', '=', codeHash)
    .where('used_at', 'is', null)
    .where('expires_at', '>', new Date())
    .returningAll()
    .executeTakeFirst();
  return row ? toStored(row) : undefined;
}

/**
 * Looks up a code by hash **only if it has already been claimed**
 * (`used_at` set) — used after {@link claimAuthorizationCode} has already
 * marked the row used, to re-inspect its stored
 * `redirect_uri`/`resource`/`voter_id` for the second half of the exchange
 * (`exchangeAuthorizationCode`). Named (and scoped) deliberately, not as a
 * general "find any code by hash" lookup (design review of 513ee16, Finding
 * 7): `exchangeAuthorizationCode`'s correctness used to depend entirely on
 * its caller having run {@link claimAuthorizationCode} first, with nothing
 * in the lookup itself enforcing that — a future caller (or anything that
 * ever sets the SDK's `skipLocalPkceValidation`) could otherwise exchange
 * an expired or never-claimed code with no error at all.
 */
export async function findClaimedAuthorizationCodeByHash(db: Kysely<Database>, codeHash: string): Promise<StoredAuthorizationCode | undefined> {
  const row = await db
    .selectFrom('authorization_codes')
    .selectAll()
    .where('code_hash', '=', codeHash)
    .where('used_at', 'is not', null)
    .executeTakeFirst();
  return row ? toStored(row) : undefined;
}
